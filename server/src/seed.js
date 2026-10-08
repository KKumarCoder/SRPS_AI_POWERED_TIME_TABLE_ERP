if(process.env.NODE_ENV==='production')throw Error('Development seed is disabled in production');
console.log('Using the non-destructive development staff enrichment; existing staff and accounts will be preserved.');
await import('./enrich-dev-staff.js');
