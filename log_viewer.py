import http.server
import socketserver
import json
import os
import webbrowser
import threading
import sys
from datetime import datetime

# Configuration
PORT = 9999
DATA_FILE = 'cleaned_data.json'
PUBLIC_DIR = 'public'

# Global Data Store
# Structure: { plane_id (int): [ { timestamp, lat, lon, alt, ... } ] }
PLANE_DATA = {}

def load_and_process_data():
    global PLANE_DATA
    print("Loading data... this may take a moment.")
    
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: {DATA_FILE} not found.")
        return
    except json.JSONDecodeError:
        print(f"Error: Failed to decode {DATA_FILE}.")
        return

    print(f"Processing {len(raw_data)} entries...")
    
    for entry in raw_data:
        ts_str = entry.get('timestamp')
        typ = entry.get('type')
        data = entry.get('data')

        if not ts_str or not data:
            continue
            
        # Parse timestamp safely
        # Format example: "2025-09-02 08:17:50,493"
        try:
            # Simple string storage is enough for frontend sorting usually, 
            # but let's keep it as string for JSON serialization.
            pass 
        except Exception:
            continue

        if typ == 'REQ' and isinstance(data, dict):
            # Main plane telemetry
            tid = data.get('takim_numarasi')
            if tid is not None:
                if tid not in PLANE_DATA:
                    PLANE_DATA[tid] = []
                
                PLANE_DATA[tid].append({
                    'timestamp': ts_str,
                    'lat': data.get('iha_enlem'),
                    'lon': data.get('iha_boylam'),
                    'alt': data.get('iha_irtifa'),
                    'heading': data.get('iha_yonelme'),
                    'roll': data.get('iha_yatis'),
                    'pitch': data.get('iha_dikilme'),
                    'speed': data.get('iha_hiz'),
                    'battery': data.get('iha_batarya')
                })

        elif typ == 'RESP' and isinstance(data, dict):
            # Other planes in range
            konum_list = data.get('konumBilgileri')
            if isinstance(konum_list, list):
                for k in konum_list:
                    tid = k.get('takim_numarasi')
                    if tid is not None:
                        if tid not in PLANE_DATA:
                            PLANE_DATA[tid] = []
                        
                        PLANE_DATA[tid].append({
                            'timestamp': ts_str,
                            'lat': k.get('iha_enlem'),
                            'lon': k.get('iha_boylam'),
                            'alt': k.get('iha_irtifa'),
                            'heading': k.get('iha_yonelme'),
                            'roll': k.get('iha_yatis'),
                            'pitch': k.get('iha_dikilme'),
                            'speed': k.get('iha_hizi'), # Note: 'iha_hizi' vs 'iha_hiz' pattern
                            # Battery usually not in RESP
                        })

    print("Sorting data...")
    # Sort each plane's data by timestamp
    for tid in PLANE_DATA:
        PLANE_DATA[tid].sort(key=lambda x: x['timestamp'])

    print(f"Data Loaded. Found {len(PLANE_DATA)} unique IDs.")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # API Endpoints
        if self.path == '/api/ids':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            ids = sorted(list(PLANE_DATA.keys()))
            self.wfile.write(json.dumps(ids).encode('utf-8'))
            return

        if self.path.startswith('/api/data/'):
            try:
                plane_id = int(self.path.split('/')[-1])
                if plane_id in PLANE_DATA:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(PLANE_DATA[plane_id]).encode('utf-8'))
                else:
                    self.send_error(404, "Plane ID not found")
            except ValueError:
                self.send_error(400, "Invalid ID format")
            return

        # Serve Static Files
        # Redirect root to index.html
        if self.path == '/' or self.path == '':
            self.path = '/public/index.html'
        
        # Allow serving from public directory directly if requested or implied
        # If path doesn't start with /public, and isn't an API, try to find it in public
        if not self.path.startswith('/public/') and not self.path.startswith('/api/'):
             self.path = '/public' + self.path

        return http.server.SimpleHTTPRequestHandler.do_GET(self)

def run_server():
    # Change dir to script directory to ensure relative paths work
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Load data first
    load_and_process_data()

    # Start Server
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        sys.stdout.flush() # Ensure output is visible
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()
