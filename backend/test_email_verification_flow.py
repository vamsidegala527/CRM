import urllib.request
import json
import urllib.error
import urllib.parse
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

print("=== TEST 1: UNREGISTERED EMAIL RESEND VERIFICATION ===")
status, body = request('http://localhost:8000/api/auth/resend-verification', {'email': 'unknown_user_999@example.com'})
print(f"Status: {status}, Detail: {body.get('detail')}")
assert status == 404, f"Expected 404 got {status}"
print("PASS: Unregistered email returns 404.")

print("\n=== TEST 2: RESEND VERIFICATION FOR REGISTERED USER ===")
test_email = 'vamsidegala000@gmail.com'
db = SessionLocal()
user = db.query(User).filter(User.email == test_email).first()
if not user:
    user = db.query(User).filter(User.email == 'vamsidegala527@gmail.com').first()
    test_email = user.email

# Temporarily mark unverified for test
user.is_verified = False
db.commit()

status, body = request('http://localhost:8000/api/auth/resend-verification', {'email': test_email})
print(f"Status: {status}, Message: {body.get('message')}")
assert status == 200, f"Expected 200 got {status}"

db.refresh(user)
assert user.verification_token is not None, "verification_token not set in DB"
token = user.verification_token
print(f"Token stored in DB: {token}")

print("\n=== TEST 3: VERIFY WITH URL-ENCODED TOKEN ===")
encoded_token = urllib.parse.quote(token)
status, body = request('http://localhost:8000/api/auth/verify-email', {'token': encoded_token})
print(f"Status: {status}, Body: {body}")
assert status == 200, f"Expected 200, got {status}"

db.refresh(user)
assert user.is_verified == True, "User is_verified was not set to True!"
assert user.verification_token is None, "verification_token was not nulled!"
assert user.verification_token_expires is None, "verification_token_expires was not nulled!"
print("PASS: Token successfully verified, user is_verified=True, single-use token invalidated.")

print("\n=== TEST 4: RE-VERIFY SAME CONSUMED TOKEN (SINGLE-USE SECURITY) ===")
status, body = request('http://localhost:8000/api/auth/verify-email', {'token': token})
print(f"Status: {status}, Detail: {body.get('detail')}")
assert status == 400, f"Expected 400 got {status}"
print("PASS: Consumed token cannot be re-used.")

print("\n=== TEST 5: RESEND VERIFICATION FOR ALREADY VERIFIED USER ===")
status, body = request('http://localhost:8000/api/auth/resend-verification', {'email': test_email})
print(f"Status: {status}, Body: {body}")
assert status == 200, f"Expected 200 got {status}"
assert "already verified" in body.get('message', '').lower()
print("PASS: Already-verified user receives clear message.")

print("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY!")
