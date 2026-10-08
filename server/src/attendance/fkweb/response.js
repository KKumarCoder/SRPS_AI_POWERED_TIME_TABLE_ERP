// Transport refusal during discovery. This is NOT a verified FkWeb acknowledgement.
// Replace production response construction only after an observed protocol fixture
// establishes status, body, content type, retry behavior and any command exchange.
export function sendUnverifiedResponse(res){return res.set('Retry-After','60').status(503).end();}
