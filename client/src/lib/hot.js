// Modules à état (lecteur SDK, tokens, cache) : on recharge la page plutôt que de perdre l'état au hot reload
export function reloadOnHotUpdate(hot, reload = () => location.reload()) {
  if (hot) hot.accept(() => reload());
}
