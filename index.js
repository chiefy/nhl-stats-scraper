var Scraper = require('./lib/Scraper');

var skaterScraper = new Scraper({
    type: 'skater'
});

skaterScraper.scrape();