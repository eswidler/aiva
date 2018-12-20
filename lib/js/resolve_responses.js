const _ = require('lodash')
const path = require('path')
const cgkb = require('cgkb')

const ioid = path.basename(__filename)

const execution_methods = {
	'knowledge': knowledge
}

// Given a message, whose input contains a conversation with multiple possible responses,
// proccesses all resolution methods and chooses an appropriate response.
// Returns a promise that resolved with a reply given the conversation in msg.
function resolve_responses(msg) {
	convo = msg['input']

	possible_responses = convo['possible_responses']
	all_dependency_values = convo['dependency_values']

	const reply = {
		to: msg.from,
		from: ioid,
		hash: msg.hash,
	}

	// Track all our resolution promises 
	var resolution_promises = []

	// Queue up all the resolution methods
	_.each(_.keys(possible_responses), function(possible_response_key) {
		var responses_for_type = possible_responses[possible_response_key]['responses']

		// Get the dependency values we need for this resolution method
		var dependency_values = _.pick(
			all_dependency_values,
			possible_responses[possible_response_key]['dependencies'],
		)

		// If this is not a default option, execute it, storing execution promises.
		if (possible_response_key != 'default') {
			resolution_promises.push(execution_methods[possible_response_key](dependency_values))
		}
	})

	// Choose the first resolution promise that resolved with an affirmative response
	// or resolve with a default response.
	return new Promise(function(resolve, reject) {
		// Resolutions should be in the format { method: [method] , value: [value]}
		// to more easily track multiple asynchronous promises
		Promise.all(resolution_promises).then((resolutions) => {
			// TODO
			// This may not be the most optimal strategy in the future with multiple successful resolutions.
			_.each(resolutions, function(resolution) {
				// TODO
				// For now we're only going to update the value if one hasn't already been set by a previous resolution.
				if (!reply.output && resolution.value) {
					reply.output = _.sample(possible_responses[resolution.method]['responses'])
				}
			})

			// If we don't have an output after executing all options, select the default
			if (!reply.output) {
				reply.output =  _.sample(possible_responses['default']['responses'])
			}

			resolve(reply)
		}).catch(reject)
	})
}

// Tests the CGKB for any noun-nodes that match a dobj dependency.
// Returns a promise that resolves to true if a node exists with that name.
function knowledge(dependency_values) {
	return new Promise(function(resolve, reject) {
		var result_found

		// TODO
		// For now search for just the dobj value
		cgkb.find(dependency_values['dobj'])
			.then((search_result) => {
				// Only select the response if we got back search results
				if (!_.isEmpty(search_result)) {
					result_found = true
				}

				resolve({
					method: 'knowledge',
					value: result_found
				})
			}).catch(global.log.error)
	})
}

module.exports = {
  resolve_responses,
}