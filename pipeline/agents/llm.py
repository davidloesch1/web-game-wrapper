"""Shared utilities for calling Gemini and loading prompt files."""

import json
import os
from pathlib import Path

import google.generativeai as genai

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
MODEL_NAME = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")


def configure():
    """Configure the Gemini client from environment."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is required")
    genai.configure(api_key=api_key)


def load_prompt(name: str) -> str:
    """Load a prompt template from the prompts/ directory."""
    path = PROMPTS_DIR / f"{name}.md"
    return path.read_text()


def call_gemini(system_prompt: str, user_message: str, *, json_output: bool = True) -> dict | str:
    """Call Gemini with a system prompt and user message.

    Returns parsed JSON dict if json_output=True, raw text otherwise.
    """
    model = genai.GenerativeModel(
        MODEL_NAME,
        system_instruction=system_prompt,
    )

    generation_config = {}
    if json_output:
        generation_config["response_mime_type"] = "application/json"

    response = model.generate_content(
        user_message,
        generation_config=genai.GenerationConfig(**generation_config) if generation_config else None,
    )

    if json_output:
        return json.loads(response.text)
    return response.text
