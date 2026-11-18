/** An error that maps to an HTTP status. Thrown from server code, turned into a response by pages/endpoints. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);
export const forbidden = (what = "You don't have permission to do that") => new HttpError(403, what);
export const badRequest = (what: string) => new HttpError(400, what);
