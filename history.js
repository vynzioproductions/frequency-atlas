/* 2026 hits, for the stations' chart archives back to January 2026.
   From Wikipedia's "List of Billboard Hot 100 top-ten singles in 2026" (top-ten entry date, peak, peak date,
   weeks in the top ten; * = still in the top ten when the page was read on Nov 26, 2026).
   Each song's rise and fall is shaped from those dates. Spotify IDs are filled in by the daily job
   (composite.js → historyIds); until then a song plays through YouTube only.
   rows: [title, artist, topTenEntry, peakPos, peakDate, weeksInTopTen, stillThere, tags] */
window.RADIO_HISTORY = {
  source: 'Billboard Hot 100 top-ten singles of 2026 (Wikipedia)',
  rows: [
    ['End of Beginning', 'Djo', '2026-01-17', 6, '2026-01-17', 3, false, 'indie alt'],
    ['I Just Might', 'Bruno Mars', '2026-01-24', 1, '2026-01-24', 25, false, 'pop rnb'],
    ['Aperture', 'Harry Styles', '2026-02-07', 1, '2026-02-07', 2, false, 'pop alt'],
    ['The Great Divide', 'Noah Kahan', '2026-02-14', 6, '2026-02-14', 1, false, 'indie country'],
    ['Risk It All', 'Bruno Mars', '2026-03-14', 4, '2026-03-14', 2, false, 'pop rnb'],
    ['Stateside', 'PinkPantheress, Zara Larsson', '2026-03-14', 6, '2026-03-21', 7, false, 'pop dance'],
    ['American Girls', 'Harry Styles', '2026-03-21', 4, '2026-03-21', 2, false, 'pop alt'],
    ['Swim', 'BTS', '2026-04-04', 1, '2026-04-04', 4, false, 'kpop pop'],
    ['Drop Dead', 'Olivia Rodrigo', '2026-05-02', 1, '2026-05-02', 7, false, 'pop alt'],
    ["I Can't Love You Anymore", 'Ella Langley, Morgan Wallen', '2026-05-09', 4, '2026-07-18', 13, true, 'country pop'],
    ['Doors', 'Noah Kahan', '2026-05-09', 9, '2026-05-09', 1, false, 'indie country'],
    ['Dracula', 'Tame Impala, JENNIE', '2026-05-16', 5, '2026-07-18', 13, true, 'alt dance kpop'],
    ['Ran to Atlanta', 'Drake, Future, Molly Santana', '2026-05-30', 2, '2026-05-30', 2, false, 'rap rnb'],
    ['Whisper My Name', 'Drake', '2026-05-30', 3, '2026-05-30', 2, false, 'rap rnb'],
    ['Shabang', 'Drake', '2026-05-30', 4, '2026-05-30', 3, false, 'rap rnb'],
    ['Honeybee', 'Olivia Rodrigo', '2026-06-27', 9, '2026-06-27', 1, false, 'pop alt'],
    ['I Knew It, I Knew You', 'Taylor Swift', '2026-06-20', 1, '2026-06-20', 11, true, 'pop'],
    ['Petal', 'Ariana Grande', '2026-08-15', 4, '2026-08-15', 1, false, 'pop rnb'],
    // in the top ten at the start of 2026
    ['DtMF', 'Bad Bunny', '2026-01-31', 1, '2026-02-21', 7, false, 'latin'],
    ['BAILE INoLVIDABLE', 'Bad Bunny', '2026-01-31', 2, '2026-02-21', 4, false, 'latin'],
    ['NUEVAYoL', 'Bad Bunny', '2026-01-31', 5, '2026-02-21', 2, false, 'latin'],
    ['Opalite', 'Taylor Swift', '2025-10-18', 1, '2026-02-28', 19, false, 'pop'],
    ['The Fate of Ophelia', 'Taylor Swift', '2025-10-18', 1, '2025-10-18', 24, false, 'pop'],
    ['Folded', 'Kehlani', '2025-11-08', 6, '2026-01-10', 19, false, 'rnb'],
    ['back to friends', 'sombr', '2025-11-22', 7, '2026-01-10', 9, false, 'indie alt'],
    ['Mutt', 'Leon Thomas', '2025-11-01', 6, '2025-11-29', 8, false, 'rnb'],
    ['Ordinary', 'Alex Warren', '2025-04-19', 1, '2025-06-07', 54, false, 'pop indie'],
    ['Golden', 'HUNTR/X, EJAE, AUDREY NUNA, REI AMI', '2025-07-19', 1, '2025-08-16', 39, false, 'kpop pop'],
    ['Daisies', 'Justin Bieber', '2025-07-26', 2, '2025-07-26', 17, false, 'pop rnb'],
  ],
};
