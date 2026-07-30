export type CinemaRequestScope = "catalog" | "collection" | "playback" | "planner" | "state";

export type CinemaRequestToken = {
  scope: CinemaRequestScope;
  key: string;
  id: string;
};

/**
 * 每个领域只允许最新代次落盘。key 会把“同一列表翻页”和“切到另一部影片”区分开，
 * 旧网络请求可以自然结束，但它的结果不能覆盖用户后来选择的页面或影片。
 */
export class CinemaRequestRegistry {
  private readonly current = new Map<CinemaRequestScope, CinemaRequestToken>();

  begin(scope: CinemaRequestScope, key = ""): CinemaRequestToken {
    const token = { scope, key, id: crypto.randomUUID() };
    this.current.set(scope, token);
    return token;
  }

  isCurrent(token: CinemaRequestToken) {
    const current = this.current.get(token.scope);
    return current?.id === token.id && current.key === token.key;
  }

  finish(token: CinemaRequestToken) {
    if (this.isCurrent(token)) this.current.delete(token.scope);
  }

  currentKey(scope: CinemaRequestScope) {
    return this.current.get(scope)?.key || "";
  }

  invalidate(scope: CinemaRequestScope) {
    this.current.delete(scope);
  }
}
