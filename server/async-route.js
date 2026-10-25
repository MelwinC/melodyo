// Express 4 ne transmet pas les rejets de promesses : sans ce wrapper, la requête resterait sans réponse
export const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);
