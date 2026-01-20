import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load env directly
load_dotenv("backend/.env")

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("❌ Error: GEMINI_API_KEY not found in backend/.env")
    exit(1)

genai.configure(api_key=api_key)

print(f"🔑 Testing API Key: {api_key[:10]}...")

models_to_test = [
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-pro"
]

print("\n🧪 Testing Models...")
for model_name in models_to_test:
    print(f"   Trying: {model_name}...", end=" ")
    try:
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Ping")
        print(f"✅ SUCCESS! Response: {response.text.strip()}")
    except Exception as e:
        print(f"❌ FAILED. Error: {str(e)[:100]}...")
