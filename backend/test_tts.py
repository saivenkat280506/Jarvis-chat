import asyncio
from tts.tts import speak

async def main():
    print("Testing TTS...")
    await speak("Testing one two three. Can you hear me, sir?")
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
