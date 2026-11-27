/* Frequency Atlas — site settings for music sign-in.
   Fill these in once and upload this file; every listener gets the sign-in buttons.
   Both values are safe to publish (they are not passwords). See README → "Music sign-in". */
window.RADIO_CONFIG = {
  // Spotify: developer.spotify.com/dashboard → Create app → copy the Client ID.
  // Add your site's address (e.g. https://yourname.github.io/frequency-atlas/) as a Redirect URI.
  spotifyClientId: '',

  // Apple Music: a MusicKit developer token (lasts up to 6 months).
  // Make it with:  node scripts/apple-token.mjs AuthKey_XXXX.p8 TEAMID KEYID
  appleDeveloperToken: '',

  // YouTube (optional): a website-restricted API key so songs the daily job hasn't matched yet
  // can be looked up on the spot. The free player works without it. See README → "YouTube player".
  youtubeApiKey: '',

  // Where "Share with everyone" sends stations (owner/repo). Worked out from the site address if left blank.
  repo: '',

  appName: 'Frequency Atlas',
  appleStorefront: 'us',
};
