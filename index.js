var
  _ = require('lodash'),
  craig = require('node-craigslist'),
  _redis = require('redis'),
  redis = _redis.createClient(),
  NEIGHBORHOODS = ['alamo square / nopa','bayview','bernal heights','castro / upper market','cole valley / ashbury hts','downtown / civic / van ness','excelsior / outer mission','financial district','glen park','haight ashbury','hayes valley','ingleside / SFSU / CCSF','inner richmond','inner sunset / UCSF','laurel hts / presidio','lower haight','lower nob hill','lower pac hts','marina / cow hollow','mission district','nob hill','noe valley','north beach / telegraph hill','pacific heights','portola district','potrero hill','richmond / seacliff','russian hill','SOMA / south beach','sunset / parkside','tenderloin','treasure island','twin peaks / diamond hts','USF / panhandle','visitacion valley','west portal / forest hill','western addition'],
  HOUSING_TYPES = ['apartment','condo','cottage/cabin','duplex','flat','house','in-law','loft','townhouse','manufactured','assisted living','land'],
  LAUNDRY = ['w/d in unit','w/d hookups','laundry in bldg','laundry on site','no laundry on site'],

  // scraper configuration
  config = {
    // TODO: Regions
    regions: [
      'sfc'
    ],

    // bump to the top
    whitelist: [
      'san francisco',
      'nob hill',
      'balboa park',
      'palo alto'
    ],

    // remove from results
    blacklist: [
      'shared room',
      'no couples'
    ],

    // criteria
    min: '1600',
    max: '2400',
    bedrooms: '2',  // minimum
    bathrooms: '1', // minimum

    // constrain results within san francisco
    neighborhoods: [
      'bernal heights',
      'cole valley / ashbury hts',
      'glen park',
      'haight ashbury',
      'inner richmond',
      'inner sunset / UCSF',
      'laurel hts / presidio',
      'lower pac hts',
      'marina / cow hollow',
      'nob hill',
      'noe valley',
      'north beach / telegraph hill',
      'pacific heights',
      'richmond / seacliff',
      'russian hill',
      'sunset / parkside',
      'twin peaks / diamond hts',
      'USF / panhandle'
    ],

    minSqft: '500',
    maxSqft: '5000',
    housingTypes: ['apartment', 'condo', 'cottage/cabin', 'duplex', 'flat', 'house', 'in-law', 'loft', 'townhouse', 'manufactured'],
    laundry: ['w/d in unit', 'laundry in bldg', 'laundry on site'],
    distance: '10', // miles
    postal: '94109'        // from zip
  };

redis.on("error", function (err) {console.log("Error " + err);});

// instantiate the client
var client = new craig.Client({
  city: 'sfbay',
  category: 'apa'
})

// begin the search
client
  .list({
    neighborhoods: _.reduce(config.neighborhoods, function(memo, item) {
      var id = NEIGHBORHOODS.indexOf(item) + 1
      memo.push('' + id)
      return memo
    }, []),
    laundry: _.reduce(config.laundry, function(memo, item) {
      var id = LAUNDRY.indexOf(item) + 1
      memo.push('' + id)
      return memo
    }, []),
    housingTypes: _.reduce(config.housingTypes, function(memo, item) {
      var id = HOUSING_TYPES.indexOf(item) + 1
      memo.push('' + id)
      return memo
    }, []),
    bedrooms: config.bedrooms,
    bathrooms: config.bathrooms,
    distance: config.distance,
    postal: config.postal,
    minPrice: config.min,
    maxPrice: config.max,
    minSqft: config.minSqft,
    maxSqft: config.maxSqft
  })
  .then(function(listings) {
    listings.forEach(function(item) {
      console.log(item)
    })
  })
  .catch(function(err) {
    console.error(err)
  })

