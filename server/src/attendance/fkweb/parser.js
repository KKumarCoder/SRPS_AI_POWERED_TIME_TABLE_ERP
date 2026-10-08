// No vendor field names, framing or acknowledgement are assumed. Implement only after
// a real T304 K7H V3.15.1116 request and retry/acknowledgement behavior have been verified.
export const protocolStatus='NOT_YET_VERIFIED';
export function parseFkWebRequest(){throw Object.assign(new Error('FkWeb protocol has not been verified against a physical T304 request'),{status:501});}
