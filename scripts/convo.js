// dependencies
// Interface script for convo engine
const _ = require('lomath')
const { Chatlog, User } = require('../db/models/index')

/* istanbul ignore next */
module.exports = (robot) => {
  /* istanbul ignore next */
  robot.respond(/.*/, (res) => {
    if (process.env.CI) {
      return
    }
    const str = res.match[0].replace(`${robot.name} `, '')
    global.client.pass({
      input: str,
      to: 'convo_classifier.py',
      intent: 'classify',
    })
    .then((reply) => {
      const convo = reply.output
      global.log.info(`Convo Score ${convo.score}, Topic: ${convo.topic}`)
      if (convo.topic === 'exception') {
        return
      }

      // If the conversation has multiple possible responses, promise to resolve the responses.
      var resolution_promise = new Promise(function(resolve, reject) {
        if (convo.possible_responses) {
          global.client.pass({
            input: convo,
            to: 'resolve_responses.js',
            intent: 'resolve_responses',
          }).then((reply) => {
            resolve(reply.output)
          }).catch(function(err) {
            global.log.error(err)
            reject()
          })
        }
        else {
          resolve()
        }
      })

      resolution_promise.then(function(resolution_result) {
         res.send(resolution_result || convo.response || 'Still resolving possible responses.')
      })
    }).catch(global.log.error)
  })

  // catch all chatlogs
  robot.hear(/.*/, () => {})

  robot.receiveMiddleware((context, next, done) => {
    const envelope = context.response.envelope
    const adapter = process.env.ADAPTER
    const userid = _.toString(_.get(envelope, 'user.id'))
    const username = _.get(envelope, 'user.username') || _.get(envelope, 'user.name')

    const inlogs = [{
      adapter,
      userid,
      username,
      room: _.get(envelope, 'room'),
      incoming: true,
      method: 'receive',
      message: (
        _.get(envelope, 'message.text') ||
        _.join(_.keys(_.get(envelope, 'message.message')), ', ')),
    }]

    User.findOrCreate({
      where: { adapter, userid },
      defaults: { username, envelope: JSON.stringify(envelope) },
    })

    _.each(inlogs, (inlog) => {
      Chatlog.create(inlog)
      global.log.debug(`[In log]: ${inlog.message}`)
    })

    return next(done)
  })

  robot.responseMiddleware((context, next, done) => {
    const target = context.response.envelope

    // global.log.info(JSON.stringify(target, null, 2))
    const replies = context.strings
    const outlogs = _.map(replies, text => ({
      adapter: process.env.ADAPTER,
      userid: _.get(target, 'user.id'),
      username: _.get(target, 'user.username') || _.get(target, 'user.name'),
      room: _.get(target, 'room'),
      incoming: false,
      method: context.method,
      message: text,
    }))
    _.each(outlogs, (outlog) => {
      Chatlog.create(outlog)
      global.log.debug(`[Out log]: ${outlog.message}`)
    })
    return next(done)
  })
}
