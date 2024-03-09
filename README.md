# Python Script for Summarization and Key Point Extraction

This script automates the process of summarizing text documents and extracting key points using OpenAI's GPT-4 and spaCy for Named Entity Recognition (NER) and noun phrase extraction. It segments large documents into smaller parts to adhere to character limits, summarizes each segment, extracts key points for context, and combines the summaries into a final document.

## Features

- Document segmentation to manage large texts.
- Text summarization using OpenAI's GPT-4 model.
- Key point extraction using spaCy's NER and noun phrase capabilities.
- Combining segment summaries into a single document.

## Requirements

- Python 3.x
- openai
- spaCy
- An OpenAI API key

## Installation

1. Clone this repository or download the script to your local machine.
2. Ensure you have Python 3.x installed on your system.
3. Install the required Python packages:

   ```bash
   pip install openai spacy
4. Download and install the spaCy English language model:

   ```bash
   python -m spacy download en_core_web_sm

## Setup

Before running the script, you must set your OpenAI API key. It is recommended to set this as an environment variable for security reasons. You can do this by adding the following line to your `.bashrc`, `.bash_profile`, or `.zshrc` file:

   ```bash
   export OPENAI_API_KEY='your_api_key_here'
   ```
Replace `your_api_key_here` with your actual OpenAI API key. After adding the line, restart your terminal or source the file to update your environment variables.

Alternatively, for Windows users, follow these steps to set your API key as an environment variable:

1. Search for "Environment Variables" in your Start menu and select "Edit the system environment variables".
2. In the System Properties window, click on the "Environment Variables..." button.
3. In the Environment Variables window, under the "User variables" section, click on "New..." to create a new user variable.
4. In the "New User Variable" dialog, enter `OPENAI_API_KEY` as the Variable name and your actual OpenAI API key as the Variable value.
5. Click OK to close the dialog, then OK again to close the Environment Variables window, and once more to close the System Properties window.

After adding the line, you might need to restart your computer or log out and back in for the changes to take effect.

## Usage

1. Prepare your input text file that you wish to summarize. Let's say it's named `transcription.txt`.
2. Open the script and customize the `summarization_prompt` variable at the top with the instructions you want the AI to follow for summarization.
3. Run the script using the following command:

   ```bash
   python your_script_name.py
   ```

The script will automatically segment your input file, summarize each segment, extract key points for enhancing context, and save the final combined summary to `combined_summary.txt`.

## Customization

- You can adjust the maximum number of characters for each document segment by changing the `max_characters` parameter in the `segment_file` function call within the `summarize_and_combine_with_key_points` function.
- The model, temperature, and max_tokens parameters in the OpenAI ChatCompletion call can be adjusted based on your requirements for the summary generation.

## Note

This script is a basic implementation and might need adjustments based on the specific requirements of your summarization task. Additionally, ensure you comply with OpenAI's usage policies and manage your API usage according to your plan's limits.
