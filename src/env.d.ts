declare namespace App {
  interface Locals {
    user: import("./lib/auth").Session["user"] | null;
    session: import("./lib/auth").Session["session"] | null;
    studio?: import("./server/studio-context").StudioContext;
  }
}
