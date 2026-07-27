declare module "*.js";

declare module "m3u8-parser" {
  export class Parser {
    manifest: Record<string, unknown>;
    push(value: string): void;
    end(): void;
  }
}
