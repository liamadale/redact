const STATUS_MESSAGES: Record<number, string> = {
  404: "The requested resource was not found",
  422: "Invalid input — please check your form",
  500: "Server error — please try again",
  502: "Backend is unavailable — is Docker running?",
  503: "Backend is unavailable — is Docker running?",
};

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    const friendly = STATUS_MESSAGES[status] ?? `Unexpected error (${status})`;
    super(friendly);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
