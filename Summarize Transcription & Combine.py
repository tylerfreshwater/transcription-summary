import openai
import spacy
import os

# Load the spaCy model
nlp = spacy.load("en_core_web_sm")

def calculate_remaining_characters(summarization_prompt):
    remaining_characters = 5000 - len(summarization_prompt)
    return remaining_characters

summarization_prompt = """ENTER ASSISTANT INSTRUCTIONS HERE"""
remaining = calculate_remaining_characters(summarization_prompt)

def segment_file(input_filepath, max_characters=remaining):
    segments = []
    with open(input_filepath, 'r', encoding='utf-8') as file:
        content = file.read()

    length = len(content)
    num_segments = length // max_characters + (1 if length % max_characters > 0 else 0)
    
    for i in range(num_segments):
        start = i * max_characters
        end = start + max_characters
        segments.append(content[start:end])
        
    return segments


def extract_key_points(summary):
    """Extract key points using spaCy for NER and noun phrases."""
    doc = nlp(summary)
    key_points = []
    # Add named entities
    for ent in doc.ents:
        key_points.append(ent.text)
    # Add noun phrases, ensuring they are not already included
    for chunk in doc.noun_chunks:
        if chunk.text not in key_points:
            key_points.append(chunk.text)
    # Combine the key points into a single string
    key_points_text = '. '.join(key_points)
    return key_points_text

def summarize_and_combine_with_key_points(input_filepath, output_filepath, api_key):
    openai.api_key = api_key
    
    segments = segment_file(input_filepath)
    combined_summary = ""
    recent_context = ""  # Initialize an empty string to hold the most recent context 
    
    for i, segment in enumerate(segments):
        print(f"Summarizing segment {i+1}/{len(segments)}...")
        
        # Ensure 'summary' has a default value for each iteration
        summary = ""
        
        #Utilizes the Assistant instructions as defined in summarization_prompt
        #Utilizes the recent segment summary for context to write the following segment
        message=[
            {"role": "assistant", "content": summarization_prompt},
            {"role": "user", "content": f"Given the context: {recent_context}. Continue a summary of the following text:\n\n{segment}"}
        ]
        
        response = openai.ChatCompletion.create(
            model="gpt-4",  # Adjust model as necessary
            messages=message,
            temperature=0.7,
            max_tokens=1600,  # Adjust based on your needs
        )
        
        summary = response["choices"][0]["message"]["content"]        
        combined_summary += f"Part {i+1} Summary:\n{summary}\n\n"
        
        # Update the recent context with key points extracted from the summary
        recent_context = extract_key_points(summary)
    
    # Save the combined summary to a file
    with open(output_filepath, 'w', encoding='utf-8') as file:
        file.write(combined_summary)
    print("Final combined summary saved to:", output_filepath)

# Set your OpenAI API key here
api_key = os.getenv('OPENAI_API_KEY')  # Recommended to use an environment variable
input_filepath = 'transcription.txt'  # Input file path
output_filepath = 'combined_summary.txt'  # Output file path

summarize_and_combine_with_key_points(input_filepath, output_filepath, api_key)