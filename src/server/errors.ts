import { t } from "../i18n";

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

export const notFound = (what?: string) => new HttpError(404, what ?? t("common.notFound"));
export const forbidden = (what?: string) => new HttpError(403, what ?? t("errors.noPermission"));
export const badRequest = (what: string) => new HttpError(400, what);
