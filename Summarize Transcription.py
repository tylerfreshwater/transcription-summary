import re
import openai

# Set your OpenAI API key here
openai.api_key = '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'

def segment_transcript(transcript, max_chars=5000):
    sentence_endings = re.compile(r'[.!?]\s', re.MULTILINE)
    segments = []
    start_index = 0

    while start_index < len(transcript):
        if len(transcript) - start_index <= max_chars:
            segments.append(transcript[start_index:])
            break
        end_index = start_index + max_chars
        sentence_end_match = sentence_endings.finditer(transcript, start_index, end_index)
        last_sentence_end = None
        for match in sentence_end_match:
            last_sentence_end = match.end()
        if not last_sentence_end:
            last_space_before_limit = transcript.rfind(' ', start_index, end_index)
            last_sentence_end = last_space_before_limit if last_space_before_limit != -1 else end_index
        segments.append(transcript[start_index:last_sentence_end].strip())
        start_index = last_sentence_end

    return segments

def summarize_segment(segment, engine='gpt-3.5-turbo-instruct', temperature=0.5):
    prompt = f"Please provide a concise summary of the following text, highlighting the main conversation topics and any takeaways from them. Do not just copy the text in the transcript, focus on what was discussed and summarizing:\n\n{segment}"
    response = openai.Completion.create(
        engine=engine,
        prompt=prompt,
        temperature=temperature,
        max_tokens=200,
        top_p=1.0,
        frequency_penalty=0.0,
        presence_penalty=0.0
    )
    return response.choices[0].text.strip()

def create_final_summary(summaries, engine='gpt-3.5-turbo-instruct', temperature=0.5):
    combined_summaries = " ".join(summaries)
    final_summary_prompt = f"Summarize the following text:\n\n{combined_summaries}"
    response = openai.Completion.create(
        engine=engine,
        prompt=final_summary_prompt,
        temperature=temperature,
        max_tokens=300,
        top_p=1.0,
        frequency_penalty=0.0,
        presence_penalty=0.0
    )
    return response.choices[0].text.strip()

def process_transcript(transcript):
    segments = segment_transcript(transcript)
    summaries = []

    # Write all segments to a combined file
    with open('combined_segments.txt', 'w', encoding='utf-8') as file:
        for i, segment in enumerate(segments):
            file.write(f"Segment {i+1}:\n{segment}\n\n")

    for i, segment in enumerate(segments):
        print(f"Summarizing segment {i+1}/{len(segments)}...")
        summary = summarize_segment(segment)
        summaries.append(summary)
        print(f"Summary for segment {i+1}: {summary}\n")

    final_summary = create_final_summary(summaries)
    
    # Write the final summary to a separate file
    with open('final_summary.txt', 'w', encoding='utf-8') as file:
        file.write(final_summary)
    
    # Write all individual segment summaries to a combined file
    with open('combined_segment_summaries.txt', 'w', encoding='utf-8') as file:
        for i, summary in enumerate(summaries):
            file.write(f"Summary of Segment {i+1}:\n{summary}\n\n")

    return final_summary

# Main execution
if __name__ == "__main__":
    transcript = """Sample Text"""
    final_summary = process_transcript(transcript)
    print("Final Summary:")
    print(final_summary)
