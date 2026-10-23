export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export const notFound = (what = "Resource") => new ServiceError(`${what} not found`, 404);
export const forbidden = () => new ServiceError("You do not have access to this resource", 403);
