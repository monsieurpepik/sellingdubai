if (window.Sentry) {
  Sentry.init({
    dsn: 'https://689d6d66d9267e827b1d4129c4fe4ee8@o4511110584926208.ingest.us.sentry.io/4511110595215360',
    environment: /sellingdubai\.(ae|com)$/.test(location.hostname) ? 'production' : 'development',
    tracesSampleRate: 0.2,
    sendDefaultPii: false
  });
}
