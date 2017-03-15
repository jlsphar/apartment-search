var
  bluebird = require('bluebird'),
  shasum = require('shasum'),
  _ = require('lodash'),
  craig = require('node-craigslist'),
  Redis = require('redis'),
  NEIGHBORHOODS = {
    sfc: ['alamo square / nopa','bayview','bernal heights','castro / upper market','cole valley / ashbury hts','downtown / civic / van ness','excelsior / outer mission','financial district','glen park','haight ashbury','hayes valley','ingleside / SFSU / CCSF','inner richmond','inner sunset / UCSF','laurel hts / presidio','lower haight','lower nob hill','lower pac hts','marina / cow hollow','mission district','nob hill','noe valley','north beach / telegraph hill','pacific heights','portola district','potrero hill','richmond / seacliff','russian hill','SOMA / south beach','sunset / parkside','tenderloin','treasure island','twin peaks / diamond hts','USF / panhandle','visitacion valley','west portal / forest hill','western addition'],
    pen: ['atherton','belmont','brisbane','burlingame','coastside/pescadero','daly city','east palo alto','foster city','half moon bay','los altos','menlo park','millbrae','mountain view','pacifica','palo alto','portola valley','redwood city','redwood shores','san bruno','san carlos','san mateo','south san francisco','woodside'],
    sby: ['campbell','cupertino','gilroy','hollister','los gatos','milpitas','morgan hill','mountain view','san jose downtown','san jose east','san jose north','san jose south','san jose west','santa clara','saratoga','sunnyvale','willow glen / cambrian'],
    nby: ['corte madera','fairfax','greenbrae','healdsburg / windsor','kentfield / ross','lake county','larkspur','mendocino county','mill valley','napa county','novato','petaluma','rohnert pk / cotati','russian river','san anselmo','san rafael','santa rosa','sausalito','sebastopol','sonoma','tiburon / belvedere','west marin'],
    eby: ['alameda','albany / el cerrito','berkeley','berkeley north / hills','brentwood / oakley','concord / pleasant hill / martinez','danville / san ramon','dublin / pleasanton / livermore','emeryville','fairfield / vacaville','fremont / union city / newark','hayward / castro valley','hercules, pinole, san pablo, el sob','lafayette / orinda / moraga','oakland downtown','oakland east','oakland hills / mills','oakland lake merritt / grand','oakland north / temescal','oakland piedmont / montclair','oakland rockridge / claremont','oakland west','pittsburg / antioch','richmond / point / annex','san leandro','vallejo / benicia','walnut creek']
  },
  HOUSING_TYPES = ['apartment','condo','cottage/cabin','duplex','flat','house','in-law','loft','townhouse','manufactured','assisted living','land'],
  LAUNDRY = ['w/d in unit','w/d hookups','laundry in bldg','laundry on site','no laundry on site'],

  // scraper configuration
  config = {
    // bump to the top
    whitelist: [
      'san francisco',
      'nob hill',
      'balboa park',
      'palo alto'
    ],

    // remove from results
    titleBlacklist: [
      'shared room',
      'private',
      'no couples'
    ],

    // criteria
    min: '1800',
    max: '2200',
    bedrooms: '2',  // minimum
    bathrooms: '1', // minimum

    // constrain results within san francisco
    neighborhoods: {
      sfc: [
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
      pen: ['atherton','belmont','brisbane','burlingame','coastside/pescadero','daly city','east palo alto','foster city','half moon bay','los altos','menlo park','millbrae','mountain view','pacifica','palo alto','portola valley','redwood city','redwood shores','san bruno','san carlos','san mateo','south san francisco','woodside'],
      eby: ['berkeley']
    },

    minSqft: '500',
    maxSqft: '5000',
    housingTypes: ['apartment', 'condo', 'cottage/cabin', 'duplex', 'flat', 'house', 'loft', 'townhouse', 'manufactured'],
    laundry: ['w/d in unit', 'laundry in bldg', 'laundry on site'],
    distance: '15',   // miles
    postal: '94109',  // from zip
    region: 'sfc',     // [sfc (San Francisco), sby (South Bay), eby (East Bay), pen (Peninsula), nby (North Bay), scz]
    regions: ['sfc', 'pen']
  };

bluebird.promisifyAll(Redis.RedisClient.prototype);
bluebird.promisifyAll(Redis.Multi.prototype);

function getNeighborhoods(reg) {
  if (config.neighborhoods[reg] && NEIGHBORHOODS[reg]) {
    return _.reduce(config.neighborhoods[reg], function(memo, item) {
      var id = NEIGHBORHOODS[reg].indexOf(item) + 1
      memo.push('' + id)
      return memo
    }, [])
  }

  return undefined
}

function getResults(reg, conf) {
  console.log('Creating client for ' + reg + '/apa')

  // instantiate the client
  var client = new craig.Client({
    city: 'sfbay',
    category: reg + '/apa'
  })

  // begin the search
  var genConfig = _.extend({}, conf, {
    neighborhoods: getNeighborhoods(reg),
  })
  console.log(genConfig)

  return client.list(genConfig)
}

function getBaseConfig() {
  return {
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
  }
}

function getRedisClient() {
  var redis = Redis.createClient()
  redis.on("error", function (err) { throw err });
  return redis
}

function getConfigKey(conf, reg) {
  var timestamp = new Date().toISOString().replace(/:.*$/, '')
  var key = shasum(timestamp + reg + JSON.stringify(conf))
  return key
}

// function getScoreForListing(listing) {
//   return undefined
// }

var results = {}
var resultsPerReg = {}

function getOnlyResults(conf, reg) {
  var key = getConfigKey(conf, reg)
  var r = getRedisClient()
  resultsPerReg[reg] = []

  setTimeout(function() {
    // if not, let's grab these results
    getResults(reg, conf)
      .then(function(items) {
        items.forEach(function(item) {
          if (!results[item.pid]) {
            results[item.pid] = item
            console.log(item)
          }

          resultsPerReg[reg].push(item.pid)
          // console.log('getting detail...')
          // client.detail(item)
        })
      })
      .catch((err) => {
        throw err
      });
    }, 0)
}


function searchApartments() {
  var conf = getBaseConfig()
  var redis = getRedisClient()

  config.regions.forEach(function(reg, idx) {
    console.log('Retriving results for ' + reg)
    // getSaveResults(conf, reg)
    getOnlyResults(conf, reg)
  })
}

searchApartments()

// function getSaveResults(conf, reg) {
//   var key = getConfigKey(conf, reg)
//   var r = getRedisClient()

//   // check if this region/hour/config has been queried
//   r.hmget(key, function(err, res) {
//     if (err) throw err
//     // if not, let's grab these results
//     if (!res) {
//       results = {}
//       console.log('Results not found! Querying craigslist...')
//       getResults(reg, conf)
//         .then(function(items) {
//           items.forEach(function(item) {
//             client.detail(item)
//               .then(function(detail) {
//                 results[item.pid] = _.extend({}, item, detail)
//                 r.hmset(key, results[item.pid])
//               })
//           })
//         })
//         .catch((err) => {
//           console.error(err);
//         });
//       results = getResults(reg, conf)
//       console.log(results)
//       console.log('Saving results...')
//       r.hmset(key, results)
//     } else {
//       console.log('Results found!')
//       console.log(results)
//     }

//     r.quit()
//     return res
//   })
// }

