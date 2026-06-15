import {
  BadRequestException,
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NoActivePolicyError } from '../../application/errors/no-active-policy.error';
import { ReviewPolicyUseCase } from '../../application/use-cases/review-policy.use-case';
import type { ReviewExpenseRequest } from './dto/review-expense.request';
import type { ReviewExpenseResponse } from './dto/review-expense.response';
import { ReviewPolicyMapper } from './review-policy.mapper';

/**
 * Endpoint de revisión de gastos. Recibe el JSON de un gasto (nombres de campo
 * externos) y devuelve el id del gasto, el estado de la política activa (en
 * español) y las alertas levantadas. La traducción entre la representación
 * externa y los contratos internos la realiza `ReviewPolicyMapper`.
 */
@Controller('expenses')
export class ReviewPolicyController {
  constructor(private readonly reviewPolicy: ReviewPolicyUseCase) {}

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
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Solicitud inválida',
      );
    }
  }
}
