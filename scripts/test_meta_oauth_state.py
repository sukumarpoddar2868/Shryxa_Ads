from auth import db

# Use an existing client owned by your account.
user_id = int(input("Your authenticated user's database ID: "))
client_id = int(input("An existing client ID that you own: "))

state = db.create_meta_oauth_state(user_id, client_id)
print("PASS: OAuth state created.")

result = db.consume_meta_oauth_state(state)

assert result is not None, "State could not be consumed."
assert result["user_id"] == user_id
assert result["client_id"] == client_id
print("PASS: State validated and consumed.")

assert db.consume_meta_oauth_state(state) is None
print("PASS: Reusing the same state is rejected.")

assert db.consume_meta_oauth_state("invalid-state") is None
print("PASS: Invalid state is rejected.")
