import sys

def scene(title):
    print()
    print("=" * 40)
    print(f"  {title}")
    print("=" * 40)
    print()

def say(text):
    print(text)

def ask(prompt):
    return input(prompt + " ")
