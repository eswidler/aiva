import json
import re
import spacy
import numpy as np
from autocorrect import spell
from copy import deepcopy
from os import path
from os.path import basename

# the ioid of this script for JSON payload 'from'
ioid = basename(__file__)  # 'hello.py'
# Load the spacy english model
nlp = spacy.load('en')

CONVO_CLASSES_PATH = path.join(
    path.dirname(__file__), '..', '..', 'data', 'convo_classes.json')
CONVO_CLASSES = json.load(open(CONVO_CLASSES_PATH))

MIN_SIM_THRESHOLD = 0.7


def vectorize_queries(convo_classes):
    for topic in convo_classes:
        topic_convo = convo_classes[topic]
        topic_convo['queries_wordvecs'] = []
        for q in topic_convo['queries']:
            q_vector = nlp(q)
            topic_convo['queries_wordvecs'].append(q_vector)
    return convo_classes

vectorize_queries(CONVO_CLASSES)


# helper to clean all text before operation
def clean_input(text):
    # first clean out symbols
    text = re.sub(r'[^\w]', ' ', text)
    # then tokenize
    text = text.split()
    # then correct all spellings
    text = map(spell, text)
    text = " ".join(text)
    return text


# classify a conversation (topic) using wordvec
# return a convo copy,
# i.e. an object in convo_classes
def wordvec_classify(input_str):
    input_str = clean_input(input_str)
    input_v = nlp(input_str)
    high_score = 0
    high_topic = 'exception'
    org_convo = CONVO_CLASSES['exception']  # default
    for topic in CONVO_CLASSES:
        topic_convo = CONVO_CLASSES[topic]
        topic_convo['dependency_values'] = {}

        # Compose variable_queries into proper forms
        # for the given input string
        if 'variable_queries' in topic_convo:
            for variable_query_str in topic_convo['variable_queries']:
                variable_query_vector = nlp(find_and_replace_dependencies(variable_query_str, input_v, topic_convo))

                topic_convo['queries_wordvecs'].append(variable_query_vector)

        local_high_score = max([
            input_v.similarity(q_v) for q_v in topic_convo['queries_wordvecs']
        ]) if topic_convo['queries_wordvecs'] else 0
        if (local_high_score > high_score and
                local_high_score > MIN_SIM_THRESHOLD):
            high_score = local_high_score
            high_topic = topic
            org_convo = topic_convo
    convo = deepcopy(org_convo)
    convo['score'] = high_score
    convo['topic'] = high_topic
    return convo

# Replaces all stand-in dependencies with their values from a conversation and input vector.
# As a side effect, updates the convo's cached dependency values with any needed for this string.
# Params:
#   string_to_fill - A string to re
#   input_v - an input vector to get dependency values if they're not available in the convo
#   convo - a conversation object that stories any currently determined dependency values
#  returns the string with dependency values filled
def find_and_replace_dependencies(string_to_fill, input_v, convo):
     # Determine the variables to extract according to their dependency label
    dependencies = list(set(re.findall(r'\[(\w+)\]', string_to_fill)))

    for dependency in dependencies:
        if dependency not in convo['dependency_values']:
            # Look through the tokens and look for any matching dependency.
            # For now assume the first match is the one to use.
            for token in input_v:
                if token.dep_ == dependency:
                    convo['dependency_values'][dependency] = token.text

    # Replace all stand-in depencies with those found in the input string
    composed_string = string_to_fill
    for dependency in convo['dependency_values']:
        my_regex = r"\[" + re.escape(str(dependency)) + r"\]"
        composed_string = re.sub(my_regex, str(convo['dependency_values'][dependency]), composed_string)

    return composed_string

def compose_response(convo):
    response = None

    if convo['responses']:
        options = convo['responses']
        response = np.random.choice(options)

    return {
        'score': convo['score'],
        'topic': convo['topic'],
        'response': response,
        'dependency_values': convo['dependency_values'],
        'possible_responses': convo.get('possible_responses')
    }

# Replaces each possible response in a conversation with a response filled with any
# dependency values needed.
# Returns the convo with all possible responses filled.
def insert_response_dependencies(convo, input_str):
    for response_type in convo['possible_responses']:
        formatted_responses_for_type = []

        for response in convo['possible_responses'][response_type]['responses']:
            formatted_responses_for_type.append(find_and_replace_dependencies(response, nlp(input_str), convo))

        convo['possible_responses'][response_type]['responses'] = formatted_responses_for_type

    return convo

# basic way to classify convo topic
# then reply by predefined responses in data/convo_classes.json
def classify_convo(input_str):
    convo = wordvec_classify(input_str)

    # If this is a question, we'll need to select
    # the right type of response
    if 'possible_responses' in convo:
        convo = insert_response_dependencies(convo, input_str)

    response_payload = compose_response(convo)
    return response_payload


# module method for socketIO
def classify(msg):
    # the reply JSON payload.
    reply = {
        'output': classify_convo(msg.get('input')),
        'to': msg.get('from'),
        'from': ioid,
        'hash': msg.get('hash')
    }
    # the py client will send this to target <to>
    return reply

# import sys
# script_arg = unicode(sys.argv[1], "utf-8")
# response = classify_convo(script_arg)

# input_v = nlp(script_arg)

# for token in compare_str:
#     print("text:" + token.text, "lemma:" + token.lemma_, "pos:"+token.pos_, "tag:"+token.tag_, "dep:"+token.dep_,
#           "shape:"+token.shape_, token.is_alpha, token.is_stop)
