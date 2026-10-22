// The real ones throw special errors that Next turns into responses. Tests need to see which one was thrown.
export class RedirectSignal extends Error {
  constructor(url) {
    super(`redirect:${url}`);
    this.url = url;
    this.kind = "redirect";
  }
}

export class NotFoundSignal extends Error {
  constructor() {
    super("not-found");
    this.kind = "not-found";
  }
}

export function redirect(url) {
  throw new RedirectSignal(url);
}

export function notFound() {
  throw new NotFoundSignal();
}
