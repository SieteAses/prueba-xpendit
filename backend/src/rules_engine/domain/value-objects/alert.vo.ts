export class Alert {
  private constructor(
    private readonly code: string,
    private readonly message: string,
  ) {}

  static create(code: string, message: string): Alert {
    if (!code.trim()) {
      throw new Error('Alert code cannot be empty');
    }
    if (!message.trim()) {
      throw new Error('Alert message cannot be empty');
    }
    return new Alert(code, message);
  }

  getCode(): string {
    return this.code;
  }

  getMessage(): string {
    return this.message;
  }
}
