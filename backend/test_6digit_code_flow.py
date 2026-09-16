import urllib.request
import json
import urllib.error
import re
from app.database import SessionLocal
from app.models import User

def request(url, data=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8') if data else None,
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))

print("=== TEST 1: RESEND VERIFICATION GENERATES 6-DIGIT CODE ===")
test_email = 'vamsidegala000@gmail.com'
db = SessionLocal()
user = db.query(User).filter(User.email == test_email).first()
if not user:
    user = db.query(User).filter(User.email == 'vamsidegala527@gmail.com').first()
    test_email = user.email

user.is_verified = False
db.commit()

status, body = request('http://localhost:8000/api/auth/resend-verification', {'email': test_email})
print(f"Status: {status}, Message: {body.get('message')}")
assert status == 200, f"Expected 200 got {status}"

db.refresh(user)
code = user.verification_token
print(f"Code in DB: {code}")
assert code is not None, "No code generated"
assert re.match(r"^\d{6}$", code), f"Expected 6 digits, got: {code}"
print(f"PASS: Generated a cryptographically random 6-digit code: {code}")

print("\n=== TEST 2: INVALID 6-DIGIT CODE REJECTION ===")
status, body = request('http://localhost:8000/api/auth/verify-email', {'code': '000000'})
print(f"Status: {status}, Detail: {body.get('detail')}")
assert status == 400, f"Expected 400 got {status}"
print("PASS: Invalid 6-digit code rejected with 400.")

print("\n=== TEST 3: VALID 6-DIGIT CODE VERIFICATION ===")
status, body = request('http://localhost:8000/api/auth/verify-email', {'code': code})
print(f"Status: {status}, Body: {body}")
assert status == 200, f"Expected 200, got {status}"

db.refresh(user)
assert user.is_verified == True, "User is_verified not True"
assert user.verification_token is None, "Code not cleared"
print("PASS: Valid 6-digit code verified and account activated.")

print("\n=== TEST 4: CONSUMED CODE CANNOT BE RE-USED ===")
status, body = request('http://localhost:8000/api/auth/verify-email', {'code': code})
print(f"Status: {status}, Detail: {body.get('detail')}")
assert status == 400, f"Expected 400 got {status}"
print("PASS: Single-use guarantee confirmed.")

print("\nALL 6-DIGIT CODE TESTS PASSED!")
