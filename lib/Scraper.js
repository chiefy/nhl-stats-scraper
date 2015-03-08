var _config = Object.create(null),
    $ = require('cheerio'),
    _ = require('lodash'),
    fs = require('fs'),
    async = require('async'),
    request = require('request');

module.exports = Scraper;

_config.base_URIs = [
    'http://nhl.com/stats/advancedstats',
    'http://nhl.com/stats/advancedteamstats'
];

_config.view_templates = {
    SHOOTING: _.template('advancedStats<%=type%>Shooting'),
    PERCENTAGES: _.template('advancedStats<%=type%>Percentages'),
    TOI: _.template('advancedStats<%=type%>ShootingTOI'),
    SCORING: _.template('advancedStats<%=type%>Scoring')
};

function reduceViewTemplates(type, newobj, template, key) {
    newobj[key] = template({
        type: type
    });
    return newobj;
}
_config.team_views = _.reduce(_config.view_templates, _.partial(reduceViewTemplates, 'Team'), Object.create(null));
_config.player_views = _.reduce(_config.view_templates, _.partial(reduceViewTemplates, 'Skater'), Object.create(null));

function Scraper(options) {
    options = options || {};
    this.type = options.type || 'team';
    this.num_results = null;
    this.views = this.type === 'team' ? _config.team_views : _config.player_views;
    this.cur_page = options.cur_page || 1;
    this.game_type = options.game_type || this.game_types.REGULAR_SEASON;
    this.season = options.season || this.seasons[0];
    this.view_name = options.view_name || this.views.SHOOTING;
    this.data = [];
}

Scraper.prototype = {
    RESULTS_PER_PAGE: 30,
    seasons: [
        '20142015',
        '20132014',
        '20122013',
        '20112012',
        '20102011'
    ],
    query_keys: {
        SEASON: 'season',
        GAMETYPE: 'gameType',
        VIEWNAME: 'viewName',
        PAGE: 'pg'
    },
    game_types: {
        REGULAR_SEASON: 2,
        PLAYOFFS: 3
    }
};

Scraper.prototype.clone = function clone(overrides) {
    overrides = overrides || {};
    var scraper_opts = {
        type: this.type,
        game_type: this.game_type,
        season: this.season,
        view_name: this.view_name
    };
    return new Scraper(_.assign(scraper_opts, overrides));
};

Scraper.prototype.getBaseUrl = function getBaseUrl() {
    return this.type === 'team' ? _config.base_URIs[1] : _config.base_URIs[0];
};

Scraper.prototype.getFileName = function() {
    var game_type = this.game_type === this.game_types.REGULAR_SEASON ? '' : '-playoffs';
    return 'json/' + this.type + '-' + this.season + game_type + '-' + this.view_name + '.json';
};

Scraper.prototype.getQueryObj = function getQueryObj() {
    var queryObj = Object.create(null);
    queryObj[this.query_keys.SEASON] = this.season;
    queryObj[this.query_keys.GAMETYPE] = this.game_type;
    queryObj[this.query_keys.VIEWNAME] = this.view_name;
    queryObj[this.query_keys.PAGE] = this.cur_page;
    return queryObj;
};

Scraper.prototype.getFullURL = function getFullURL() {
    var qs = _.reduce(this.getQueryObj(), function(qs, obj, key) {
        qs += (qs.length === 0 ? '?' : '&') + key + '=' + obj;
        return qs;
    }, '');
    return this.getBaseUrl() + qs;
};

Scraper.prototype.scrape = function scrape(cb) {
    console.info('Scraping URL: ' + this.getFullURL());
    var scraper_cb = _.bind(this.scraperCb, this, cb);

    request({
        url: this.getBaseUrl(),
        qs: this.getQueryObj()
    }, scraper_cb);

};

Scraper.prototype.scraperFactory = function(clone_opts, cb) {
    clone_opts = clone_opts || {};
    var new_scraper = this.clone(clone_opts);
    new_scraper.scrape(cb);
    return new_scraper;
};


Scraper.prototype.scrapeCollection = function(collection, override_key, cb) {
    collection = collection || [];

    if (!_.isArray(collection)) {
        throw new Error('collection must be an array.');
    }

    function mapCollection(val) {
        var factory_opts = Object.create(null);
        factory_opts[override_key] = val;
        return _.bind(this.scraperFactory, this, factory_opts);
    }

    var series_mapped_fns = collection.map(mapCollection.bind(this));

    async.series(series_mapped_fns, cb);
};

Scraper.prototype.scrapeAllSeasons = function scrapeAllSeasons(cb) {
    return this.scrapeCollection(this.seasons, 'season', cb);
};

Scraper.prototype.scrapeAllViews = function scrapeAllViews(cb) {
    return this.scrapeCollection(_.values(this.views), 'view_name', cb);
};

Scraper.prototype.scrapeAllSeasonsAllViews = function scrapeAllSeasonsAllViews(cb) {
    var cur_season_idx = 0,
        scrape_all_views = _scrapeAllViews.bind(this);

    function _scrapeAllViews() {
        if (cur_season_idx >= this.seasons.length) {
            return cb(null, true);
        }
        this.season = this.seasons[cur_season_idx++];
        this.scrapeAllViews(scrape_all_views);
    }
    scrape_all_views();

};


Scraper.prototype.scraperCb = function scraperCb(cb, err, msg, resp) {
    var scraped_data = this.data || [],
        $html = $(resp),
        $data_table = $('#statsPage table', $html).eq(1),
        $keys = $('tr', $data_table).eq(0).find('th'),
        keys = $keys.map(function(ind, el) {
            return {
                index: ind,
                key: $(el)
                    .text()
                    .trim()
            };
        }),
        handle;

    $data_table.remove($keys);

    if (this.num_results === null) {
        try {
            this.num_results = _.parseInt($html.find('.paging').text().match(/of\s([0-9]+)/)[1]);
        } catch (ex) {
            console.info('Could not find any results for ' + this.getFullURL());
            return cb(null, null);
        }
    }

    $('tr', $data_table)
        .each(function(ind, el) {
            var data_item = {};

            $('td', el)
                .each(function(ind) {
                    var key = keys[ind].key,
                        data = $(this)
                        .text()
                        .trim();
                    if (key.length === 0) {
                        return;
                    }
                    // Try to massage numeric data into it's proper type
                    if (data.indexOf('.') !== -1) {
                        data = parseFloat(data);
                    } else if (!_.isNaN(_.parseInt(data))) {
                        data = _.parseInt(data);
                    }
                    data_item[key] = data;
                });
            if (_.keys(data_item).length === 0) {
                return;
            }
            scraped_data.push(data_item);
        });


    if (this.num_results > (this.cur_page * this.RESULTS_PER_PAGE)) {
        this.cur_page++;
        return this.scrape(cb);
    } else {
        handle = fs.openSync(this.getFileName(), 'w+');
        fs.writeSync(handle, JSON.stringify(scraped_data, null, '\t'));
        cb(null, scraped_data);
    }
};