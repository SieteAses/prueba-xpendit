import {
  BadRequestException,
  Body,
  Controller,
  Inject,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ReviewPolicyCommand } from '../../application/dto/review-policy.command';
import { errorMessage } from '../../application/errors/error-message';
import { NoActivePolicyError } from '../../application/errors/no-active-policy.error';
import { type Clock, CLOCK } from '../../application/ports/clock.port';
import {
  ReviewExpenseBatchUseCase,
  type BatchItemOutcome,
} from '../../application/use-cases/review-expense-batch.use-case';
import { ReviewPolicyUseCase } from '../../application/use-cases/review-policy.use-case';
import {
  ExchangeRateCallCounter,
  type ExchangeRateUsage,
} from '../exchange-rate/exchange-rate-call-counter';
import {
  parseExpensesCsv,
  toReviewExpenseRequest,
  type CsvExpenseRow,
} from './csv-expense.parser';
import type { ReviewExpenseRequest } from './dto/review-expense.request';
import type { ReviewExpenseResponse } from './dto/review-expense.response';
import type {
  ReviewFileResponse,
  ReviewFileRowError,
} from './dto/review-file.response';
import { ReviewPolicyMapper } from './review-policy.mapper';

/** Referencia de un command a la fila/gasto_id del CSV de los que proviene. */
interface RowRef {
  fila: number;
  gastoId: string | null;
}

/**
 * Endpoint de revisión de gastos. Recibe el JSON de un gasto (nombres de campo
 * externos) y devuelve el id del gasto, el estado de la política activa (en
 * español) y las alertas levantadas. La traducción entre la representación
 * externa y los contratos internos la realiza `ReviewPolicyMapper`.
 */
@Controller('expenses')
export class ReviewPolicyController {
  constructor(
    private readonly reviewPolicy: ReviewPolicyUseCase,
    private readonly reviewBatch: ReviewExpenseBatchUseCase,
    private readonly exchangeCounter: ExchangeRateCallCounter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('review')
  async review(
    @Body() request: ReviewExpenseRequest,
  ): Promise<ReviewExpenseResponse> {
    try {
      const result = await this.reviewPolicy.execute(
        ReviewPolicyMapper.toCommand(request),
      );
      return ReviewPolicyMapper.toResponse(result);
    } catch (error) {
      if (error instanceof NoActivePolicyError) {
        throw new ServiceUnavailableException(error.message);
      }
      // Resto de errores (validación de campos, monto negativo, etc.) → 400.
      throw new BadRequestException(errorMessage(error));
    }
  }

  /**
   * Revisión por lote a partir de un CSV. Recibe un archivo (`multipart/form-data`,
   * campo `file`) con una fila por gasto y cabeceras con los nombres externos.
   * Delega la revisión y la detección de anomalías de lote (duplicados exactos)
   * a {@link ReviewExpenseBatchUseCase}. Las filas inválidas (monto no numérico
   * al parsear, o moneda/categoría desconocida y monto negativo al revisar) se
   * aíslan en `errores` con su número de fila, sin abortar el lote. La ausencia
   * de una política activa sí aborta toda la petición con 503. Reporta también la
   * fecha de ejecución y, en `tasas_api`, el uso del proveedor de tasas (llamadas
   * reales vs. caché) de este lote y del acumulado total.
   */
  @Post('review-file')
  @UseInterceptors(FileInterceptor('file'))
  async reviewFile(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ReviewFileResponse> {
    if (!file) {
      throw new BadRequestException('Falta el archivo CSV (campo "file").');
    }

    // Instante de ejecución: las reglas dependientes de la fecha (antigüedad) se
    // evalúan respecto a "ahora", así que se reporta para mantener la analítica
    // interpretable cuando se guarde el resultado.
    const fechaEjecucion = this.clock.now().toISOString();

    let rows: CsvExpenseRow[];
    try {
      rows = parseExpensesCsv(file.buffer.toString('utf-8'));
    } catch (error) {
      throw new BadRequestException(
        `No se pudo leer el CSV: ${errorMessage(error)}`,
      );
    }

    const { commands, refs, errores } = this.toCommands(rows);

    // Mide el uso de la API de tasas atribuible a este lote (aislado por petición).
    let outcomes: BatchItemOutcome[];
    let usoLote: ExchangeRateUsage;
    try {
      const medicion = await this.exchangeCounter.measure(() =>
        this.reviewBatch.execute(commands),
      );
      outcomes = medicion.result;
      usoLote = medicion.usage;
    } catch (error) {
      if (error instanceof NoActivePolicyError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw new BadRequestException(errorMessage(error));
    }

    const resultados: ReviewExpenseResponse[] = [];
    outcomes.forEach((outcome, j) => {
      if (outcome.kind === 'ok') {
        resultados.push(ReviewPolicyMapper.toResponse(outcome.result));
      } else {
        errores.push({
          fila: refs[j].fila,
          gasto_id: refs[j].gastoId,
          error: outcome.message,
        });
      }
    });
    errores.sort((a, b) => a.fila - b.fila);

    return {
      fecha_ejecucion: fechaEjecucion,
      total: rows.length,
      resultados,
      errores,
      tasas_api: {
        lote: {
          llamadas_api: usoLote.apiCalls,
          cache_hits: usoLote.cacheHits,
        },
        total: {
          llamadas_api: this.exchangeCounter.total.apiCalls,
          cache_hits: this.exchangeCounter.total.cacheHits,
        },
      },
    };
  }

  /**
   * Parsea las filas crudas del CSV a comandos internos, aislando los errores de
   * parseo (p. ej. monto no numérico) por fila para no abortar el lote.
   */
  private toCommands(rows: CsvExpenseRow[]): {
    commands: ReviewPolicyCommand[];
    refs: RowRef[];
    errores: ReviewFileRowError[];
  } {
    const commands: ReviewPolicyCommand[] = [];
    const refs: RowRef[] = [];
    const errores: ReviewFileRowError[] = [];

    rows.forEach((row, i) => {
      // +1 por la cabecera, +1 para que la primera fila de datos sea la 2.
      const fila = i + 2;
      const gastoId = row.gasto_id ?? null;
      try {
        const request: ReviewExpenseRequest = toReviewExpenseRequest(row);
        commands.push(ReviewPolicyMapper.toCommand(request));
        refs.push({ fila, gastoId });
      } catch (error) {
        errores.push({ fila, gasto_id: gastoId, error: errorMessage(error) });
      }
    });

    return { commands, refs, errores };
  }
}
