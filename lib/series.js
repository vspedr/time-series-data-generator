const Ajv     = require('ajv');
const {Range} = require('immutable');
const {jStat} = require('jStat');
const math    = require('mathjs');
const moment  = require('moment');
const R       = require('ramda');

const {randomInt} = require('./random');
const Ratio       = require('./ratio');

const TYPE_MONOSPACED = 'monospaced';
const TYPE_RANDOM     = 'random';

class Series {
  constructor(options = {}) {
    const now      = moment().startOf('second');
    const defaults = {
      type     : TYPE_MONOSPACED,
      from     : moment(now).subtract(1, 'hour').toISOString(),
      until    : now.toISOString(),
      interval : 5 * 60, // seconds
      numOfData: 10,
      keyName  : 'value',
    };
    const schema = {
      $schema   : 'http://json-schema.org/schema#',
      type      : 'object',
      properties: {
        type     : {type: 'string', enum: [TYPE_MONOSPACED, TYPE_RANDOM], default: defaults.type},
        from     : {type: ['integer', 'string'], format: 'date-time', default: defaults.from },
        until    : {type: ['integer', 'string'], format: 'date-time', default: defaults.until},
        interval : {type: 'integer', default: defaults.interval},
        numOfData: {type: 'integer', min: 0, default: defaults.numOfData},
        keyName  : {type: 'string', default: defaults.keyName},
      },
      additionalProperties: false,
    };
    const ajv     = new Ajv({useDefaults: true});
    const isValid = ajv.validate(schema, options);
    if (!isValid) {
      const error = ajv.errors[0];
      throw Error(`options${error.dataPath} ${error.message}`);
    }

    this.type      = options.type;
    this.from      = moment(options.from );
    this.until     = moment(options.until);
    this.interval  = moment.duration(options.interval, 'seconds');
    this.numOfData = options.numOfData;
    this.keyName   = options.keyName;
  }

  _timestamps() {
    switch (this.type) {
      case TYPE_MONOSPACED:
        return Range(this.from.unix(), this.until.unix() + 1, this.interval.asSeconds());
      case TYPE_RANDOM:
        const min = this.from .unix();
        const max = this.until.unix();
        return Range(0, this.numOfData)
          .map((x) => randomInt(min, max))
          .sort();
      default:
        assert(false);
    }
  }

  generate(func) {
    return this._timestamps()
      .map((unix) => R.assoc(this.keyName, func(unix), {timestamp: moment(unix * 1000).toISOString()}))
      .toJSON();
  }

  _trigonometric(func, options = {}) {
    const defaults = {
      coefficient  : 1.0,
      constant     : 0.0,
      decimalDigits: 2,
      period       : 1 * 60 * 60, // seconds
    };
    const schema = {
      $schema   : 'http://json-schema.org/schema#',
      type      : 'object',
      properties: {
        coefficient  : {type: 'number' , default: defaults.coefficient},
        constant     : {type: 'number' , default: defaults.constant},
        decimalDigits: {type: 'integer', minimum: 0, maximum: 10, default: defaults.decimalDigits},
        period       : {type: 'integer', minimum: 1, default: defaults.period},
      },
      additionalProperties: false,
    }
    const ajv     = new Ajv({useDefaults: true});
    const isValid = ajv.validate(schema, options);
    if (!isValid) {
      const error = ajv.errors[0];
      throw Error(`options${error.dataPath} ${error.message}`);
    }

    const scale = 2 * Math.PI / options.period;
    return this.generate((unix) => {
      const value = options.coefficient * func(unix * scale) + options.constant;
      return math.round(value, options.decimalDigits);
    });
  }

  sin(options) {
    return this._trigonometric(Math.sin, options);
  }

  cos(options) {
    return this._trigonometric(Math.cos, options);
  }

  gaussian(options = {}) {
    const defaults = {
      mean         : 10,
      variance     : 1,
      decimalDigits: 2,
    };
    const schema = {
      type      : 'object',
      properties: {
        mean         : {type: 'number', default: defaults.mean},
        variance     : {type: 'number', default: defaults.variance},
        decimalDigits: {type: 'integer', minimum: 0, maximum: 10, default: defaults.decimalDigits},
      },
    };
    const ajv     = new Ajv({useDefaults: true});
    const isValid = ajv.validate(schema, options);
    if (!isValid) {
      const error = ajv.errors[0];
      throw Error(`options${error.dataPath} ${error.message}`);
    }

    return this.generate((unix) => {
      const value = jStat.normal.sample(options.mean, options.variance);
      return math.round(value, options.decimalDigits);
    });
  }

  ratio(params) {
    const ratio = new Ratio(params);
    return this.generate((_) => ratio.sample());
  }
}

module.exports = Series;