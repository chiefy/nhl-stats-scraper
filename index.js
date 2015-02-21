var $ = require('cheerio'),
    request = require('request'),
    _ = require('lodash'),
    fs = require('fs');

var base_URI = 'http://nhl.com/stats/advancedteamstats';

var query_keys = {
    SEASON: 'season',
    GAMETYPE: 'gameType',
    VIEWNAME: 'viewName'
};

var game_types = {
    REGULAR_SEASON: 2,
    PLAYOFFS: 3
};

var team_views = {
    SHOOTING: 'advancedStatsTeamShooting',
    PERCENTAGES: 'advancedStatsTeamPercentages',
    TOI: 'advancedStatsTeamShootingTOI',
    SCORING: 'advancedStatsTeamScoring'
};

var config = {
    season: '20142015',
    gameType: game_types.REGULAR_SEASON,
    viewName: team_views.SHOOTING
};

request({
    url: base_URI,
    qs: config
}, function (err, msg, resp) {
    var scraped_data = [];

    var $html = $(resp);

    var $data_table = $('#statsPage table', $html)
        .eq(1);

    var $keys = $('tr', $data_table)
        .eq(0)
        .find('th');

    var keys = $keys
        .map(function (ind, el) {
            return {
                index: ind,
                key: $(el)
                    .text()
                    .trim()
            };
        });
    $data_table.remove($keys);

    $('tr', $data_table)
        .each(function (ind, el) {
            var data_item = {};

            $('td', el)
                .each(function (ind, el) {
                    var key = keys[ind].key,
                        data = $(this)
                        .text()
                        .trim();
                    if (key.length === 0) {
                        return;
                    }
                    data_item[key] = data;
                });
            scraped_data.push(data_item);
        });
    //console.info(err, msg, resp);
    var handle = fs.openSync('nhl-teamstats-advanced-' + config.season + '-' + config.gameType + '-' + config.viewName + '.json', 'w+');
    fs.writeSync(handle, JSON.stringify(scraped_data, null, '\t'));

});