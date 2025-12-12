import re
import json
import ast
import os

def parse_log_file(input_path, output_path):
    data = []
    
    # Regex patterns
    # Example: 2025-09-02 08:17:50,493 - INFO - REQ: {...}
    log_pattern = re.compile(r'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) - (\w+) - (\w+): (.*)')
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for line in lines:
            match = log_pattern.search(line)
            if match:
                timestamp, level, msg_type, content = match.groups()
                
                entry = {
                    "timestamp": timestamp,
                    "type": msg_type
                }
                
                if msg_type == 'REQ':
                    try:
                        # REQ content is a Python dictionary string (single quotes)
                        # We use ast.literal_eval to safely parse it
                        parsed_content = ast.literal_eval(content)
                        entry["data"] = parsed_content
                        data.append(entry)
                    except Exception as e:
                        print(f"Error parsing REQ at {timestamp}: {e}")
                        
                elif msg_type == 'RESP':
                    try:
                        # RESP content is a JSON string (double quotes) or sometimes just an integer (error code?)
                        # The log shows: RESP: {"sunucusaati":...} AND RESP: 3
                        # If it's a simple number or string, json.loads might fail or return a primitive.
                        # Let's try json.loads first.
                        if content.strip().isdigit():
                             entry["data"] = int(content.strip())
                        else:
                            parsed_content = json.loads(content)
                            entry["data"] = parsed_content
                        data.append(entry)
                    except json.JSONDecodeError:
                        # Fallback for non-JSON content
                        entry["data"] = content
                        data.append(entry)
                    except Exception as e:
                        print(f"Error parsing RESP at {timestamp}: {e}")

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
            
        print(f"Successfully processed {len(data)} entries. Output saved to {output_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {input_path}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    # Use absolute paths or relative to the script location
    input_file = "02.09.2025-08.17.txt"
    output_file = "cleaned_data.json"
    
    # Check if we are in the right directory, if not, try to construct absolute path
    if not os.path.exists(input_file):
        # Fallback to the known path from context if running from elsewhere
        input_file = r"c:\Users\Meteh\Desktop\Projects\antigravity\02.09.2025-08.17.txt"
        
    parse_log_file(input_file, output_file)
