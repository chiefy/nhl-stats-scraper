var Scraper = require('./lib/Scraper');

// Regular Season
(new Scraper({
	type: 'team'
})).scrapeAllSeasons(function() {
	console.info('Team Regular Season Done!');
});

// Playoffs
(new Scraper({
	type: 'team',
	game_type: 3
})).scrapeAllSeasons(function() {
	console.info('Team Playoffs Done!');
});

// Regular Season
(new Scraper({
	type: 'skater'
}).scrapeAllSeasonsAllViews(function() {
	console.info('Skater Regular Season Done!');
}));

// Playoffs
(new Scraper({
	type: 'skater',
	game_type: 3
}).scrapeAllSeasonsAllViews(function() {
	console.info('Skater Playoffs Done!');
}));