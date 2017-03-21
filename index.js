/*
// Execute on each region page to generate the appropriate NEIGHBORHOODS map
var nhs = {}; $('[id*=nh_]').each(function(nh){nhs[$(this).attr('id').match(/[0-9]{1,2}/)[0]] = $(this).parent().text().replace(/\s+/,'').replace(/[^a-z]+$/,'')}); console.log(JSON.stringify(nhs));
*/
var
  bluebird = require('bluebird'),
  shasum = require('shasum'),
  _ = require('lodash'),
  craig = require('node-craigslist'),
  Redis = require('redis'),
  NEIGHBORHOODS = {
    sfc: _.invert({"1":"SOMA / south beach","2":"USF / panhandle","3":"bernal heights","4":"castro / upper market","5":"cole valley / ashbury hts","6":"downtown / civic / van ness","7":"excelsior / outer mission","8":"financial district","9":"glen park","10":"lower haight","11":"west portal / forest hill","12":"hayes valley","13":"ingleside","14":"inner richmond","15":"treasure island","16":"portola district","17":"marina / cow hollow","18":"mission district","19":"nob hill","20":"lower nob hill","21":"noe valley","22":"north beach / telegraph hill","23":"pacific heights","24":"lower pac hts","25":"potrero hill","26":"richmond / seacliff","27":"russian hill","28":"sunset / parkside","29":"twin peaks / diamond hts","30":"western addition"}),
    pen: _.invert({"11":"coastside/pescadero","16":"woodside","70":"atherton","71":"belmont","73":"brisbane","74":"burlingame","75":"daly city","76":"east palo alto","77":"foster city","78":"los altos","79":"menlo park","80":"millbrae","81":"mountain view","82":"pacifica","83":"palo alto","84":"redwood city","85":"redwood shores","86":"san bruno","87":"san carlos","88":"san mateo","89":"south san francisco"}),
    sby: _.invert({"10":"milpitas","11":"morgan hill","15":"hollister","31":"campbell","32":"cupertino","33":"gilroy","34":"los gatos","35":"mountain view","36":"san jose downtown","37":"san jose east","38":"san jose north","39":"san jose south","40":"san jose west","41":"santa clara","43":"saratoga","44":"sunnyvale","45":"willow glen / cambrian"}),
    nby: _.invert({"10":"west marin","11":"rohnert pk / cotati","14":"russian river","15":"mendocino county","91":"corte madera","92":"fairfax","93":"greenbrae","94":"kentfield / ross","95":"larkspur","96":"mill valley","97":"napa county","98":"novato","99":"petaluma"}),
    eby: _.invert({"11":"pittsburg / antioch","14":"brentwood / oakley","15":"fairfield / vacaville","46":"alameda","47":"albany / el cerrito","48":"berkeley","49":"berkeley north / hills","51":"concord / pleasant hill / martinez","52":"danville / san ramon","53":"dublin / pleasanton / livermore","54":"fremont / union city / newark","55":"hayward / castro valley","56":"hercules, pinole, san pablo, el sob","57":"lafayette / orinda / moraga","58":"oakland downtown","59":"oakland east","60":"oakland hills / mills","61":"oakland lake merritt / grand","62":"oakland north / temescal","63":"oakland piedmont / montclair","64":"oakland west","65":"richmond / point / annex","66":"oakland rockridge / claremont","67":"san leandro","68":"vallejo / benicia","69":"walnut creek"}),
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
    max: '2300',
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
      eby: ['berkeley', 'emeryville', 'oakland west'],
      sby: []
    },

    // minSqft: '500',
    // maxSqft: '5000',
    housingTypes: ['apartment', 'condo', 'cottage/cabin', 'duplex', 'flat', 'house', 'loft', 'townhouse', 'manufactured'],
    laundry: ['w/d in unit', 'laundry in bldg', 'laundry on site'],
    distance: '50',   // miles
    postal: '94109',  // from zip
    regions: ['sfc', 'pen', 'eby']
  }

// bluebird.promisifyAll(Redis.RedisClient.prototype);
// bluebird.promisifyAll(Redis.Multi.prototype);

function getNeighborhoods(reg) {
  if (config.neighborhoods[reg] && NEIGHBORHOODS[reg]) {
    return _.reduce(config.neighborhoods[reg], function(memo, item) {
      memo.push(NEIGHBORHOODS[reg][item])
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

var results = {
  "6038876886": true,
"6013738701": true,
"6028408421": true,
"6027839640": true,
"6045751998": true,

 }

var resultsPerReg = {}
var sys = require('sys')
var exec = require('child_process').exec;
function puts(error, stdout, stderr) { sys.puts(stdout) }
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
            exec("chromium " + item.url, puts);
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

