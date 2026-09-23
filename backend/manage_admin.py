#!/usr/bin/env python3
"""
Developer Admin Account Management CLI
Provides full CRUD (Create, Read/List, Update, Delete) capabilities for Admin accounts.

Can be run:
  1. Inside Docker:
       docker exec -it hr_backend_container python manage_admin.py [command]
  2. Directly on Host:
       cd backend && python manage_admin.py [command]
  3. Interactively (no arguments):
       docker exec -it hr_backend_container python manage_admin.py
"""

import sys
import os
import argparse
import getpass
import re
from typing import Optional

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash


EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_email_str(email: str) -> bool:
    return bool(EMAIL_REGEX.match(email.strip()))


def list_admins() -> None:
    """Lists all admin accounts in the database."""
    db = SessionLocal()
    try:
        admins = db.query(User).filter(User.role == "admin").order_by(User.id.asc()).all()
        print("\n" + "=" * 80)
        print(f"  ADMIN ACCOUNTS LIST ({len(admins)} total)")
        print("=" * 80)
        if not admins:
            print("  No admin accounts found in the database.")
            print("=" * 80 + "\n")
            return

        header = f" {'ID':<4} | {'Full Name':<20} | {'Email':<30} | {'Active':<6} | {'Created At'}"
        print(header)
        print("-" * 80)
        for a in admins:
            created = a.created_at.strftime("%Y-%m-%d %H:%M") if a.created_at else "N/A"
            status = "Yes" if a.is_active else "No"
            name = (a.full_name[:18] + "..") if len(a.full_name) > 20 else a.full_name
            email = (a.email[:28] + "..") if len(a.email) > 30 else a.email
            print(f" {a.id:<4} | {name:<20} | {email:<30} | {status:<6} | {created}")
        print("=" * 80 + "\n")
    finally:
        db.close()


def create_admin(email: str, full_name: str, password: str, promote_existing: bool = False) -> bool:
    """Creates a new admin account or optionally promotes an existing employee to admin."""
    email = email.strip().lower()
    full_name = full_name.strip()

    if not validate_email_str(email):
        print(f"\n[ERROR] Invalid email format: '{email}'")
        return False

    if len(password) < 8:
        print("\n[ERROR] Password must be at least 8 characters long.")
        return False

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            if existing.role == "admin":
                print(f"\n[INFO] User '{email}' already exists as an Admin (ID: {existing.id}).")
                print("If you wish to update password or details, run the 'update' command.")
                return False
            elif existing.role == "employee":
                if not promote_existing:
                    print(f"\n[WARNING] User '{email}' already exists as an employee (ID: {existing.id}).")
                    print("To promote this user to admin, supply the --promote flag or confirm promotion.")
                    return False
                print(f"\n[PROMOTING] Promoting existing employee '{email}' to Admin...")
                existing.role = "admin"
                existing.full_name = full_name or existing.full_name
                existing.hashed_password = get_password_hash(password)
                existing.is_active = True
                existing.is_verified = True
                existing.is_setup_complete = True
                db.commit()
                print(f"[SUCCESS] Successfully promoted '{email}' to Admin!")
                return True

        hashed = get_password_hash(password)
        new_admin = User(
            email=email,
            full_name=full_name,
            hashed_password=hashed,
            role="admin",
            auth_provider="email",
            is_active=True,
            is_verified=True,
            is_setup_complete=True,
            first_login=False,
            login_count=0
        )
        db.add(new_admin)
        db.commit()
        db.refresh(new_admin)
        print(f"\n[SUCCESS] Admin account created successfully!")
        print(f"  ID:        {new_admin.id}")
        print(f"  Public ID: {new_admin.public_id}")
        print(f"  Email:     {new_admin.email}")
        print(f"  Name:      {new_admin.full_name}")
        print(f"  Role:      {new_admin.role}")
        print(f"  Status:    {'Active' if new_admin.is_active else 'Inactive'}\n")
        return True
    finally:
        db.close()


def update_admin(email: str, password: Optional[str] = None, full_name: Optional[str] = None,
                 activate: Optional[bool] = None) -> bool:
    """Updates an existing admin's password, name, or active status."""
    email = email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"\n[ERROR] Account '{email}' not found.")
            return False

        if user.role != "admin":
            print(f"\n[ERROR] Account '{email}' is not an admin (Role: {user.role}).")
            return False

        updated_fields = []
        if password is not None and password.strip():
            if len(password) < 8:
                print("\n[ERROR] Password must be at least 8 characters long.")
                return False
            user.hashed_password = get_password_hash(password)
            user.is_setup_complete = True
            updated_fields.append("password")

        if full_name is not None and full_name.strip():
            user.full_name = full_name.strip()
            updated_fields.append("full_name")

        if activate is not None:
            user.is_active = activate
            updated_fields.append(f"is_active={activate}")

        if not updated_fields:
            print("\n[INFO] No changes provided.")
            return False

        db.commit()
        print(f"\n[SUCCESS] Successfully updated admin '{email}' ({', '.join(updated_fields)}).\n")
        return True
    finally:
        db.close()


def delete_admin(email: str, force: bool = False) -> bool:
    """Deletes an admin account from the database."""
    email = email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"\n[ERROR] Account '{email}' not found.")
            return False

        if user.role != "admin":
            print(f"\n[ERROR] Account '{email}' has role '{user.role}', not 'admin'.")
            return False

        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            print(f"\n[CRITICAL WARNING] '{email}' is the ONLY remaining admin in the database!")
            print("Deleting this admin will leave the application with NO administrators.")

        if not force:
            confirm = input(f"Are you sure you want to permanently delete admin '{email}'? [y/N]: ").strip().lower()
            if confirm not in ["y", "yes"]:
                print("[CANCELLED] Deletion cancelled by developer.")
                return False

        db.delete(user)
        db.commit()
        print(f"\n[SUCCESS] Admin account '{email}' permanently deleted from database.\n")
        return True
    finally:
        db.close()


def interactive_menu():
    """Interactive Developer CLI Menu."""
    while True:
        print("\n" + "=" * 50)
        print("  HR PORTAL - ADMIN ACCOUNT MANAGEMENT")
        print("=" * 50)
        print(" 1. List all Admin accounts")
        print(" 2. Create a new Admin account")
        print(" 3. Update an Admin (Password, Name, Status)")
        print(" 4. Delete an Admin account")
        print(" 5. Exit")
        print("=" * 50)

        choice = input("Enter choice (1-5): ").strip()

        if choice == "1":
            list_admins()
        elif choice == "2":
            print("\n--- Create Admin Account ---")
            email = input("Email: ").strip()
            name = input("Full Name: ").strip()
            password = getpass.getpass("Password (min 8 chars): ").strip()
            confirm = getpass.getpass("Confirm Password: ").strip()
            if password != confirm:
                print("[ERROR] Passwords do not match.")
                continue
            create_admin(email=email, full_name=name, password=password, promote_existing=True)
        elif choice == "3":
            print("\n--- Update Admin Account ---")
            email = input("Enter admin email to update: ").strip()
            print("Leave blank to keep unchanged:")
            new_name = input("New Full Name: ").strip() or None
            new_pwd = getpass.getpass("New Password (or blank to skip): ").strip() or None
            if new_pwd:
                confirm = getpass.getpass("Confirm New Password: ").strip()
                if new_pwd != confirm:
                    print("[ERROR] Passwords do not match.")
                    continue
            status_input = input("Change status? (a: Active / d: Deactive / enter to skip): ").strip().lower()
            act = None
            if status_input == "a":
                act = True
            elif status_input == "d":
                act = False
            update_admin(email=email, password=new_pwd, full_name=new_name, activate=act)
        elif choice == "4":
            print("\n--- Delete Admin Account ---")
            email = input("Enter admin email to delete: ").strip()
            delete_admin(email=email)
        elif choice in ["5", "q", "exit"]:
            print("Goodbye.")
            break
        else:
            print("[ERROR] Invalid selection, please enter 1 to 5.")


def main():
    parser = argparse.ArgumentParser(
        description="Developer Admin Account Management Utility (CRUD)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode:
  python manage_admin.py

  # List admins:
  python manage_admin.py list

  # Create an admin:
  python manage_admin.py create --email admin@company.com --name "Super Admin" --password "SecurePass123!"

  # Update an admin password:
  python manage_admin.py update --email admin@company.com --password "NewSecurePass123!"

  # Delete an admin:
  python manage_admin.py delete --email admin@company.com --force
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Sub-commands")

    # List
    subparsers.add_parser("list", help="List all admin accounts")

    # Create
    create_parser = subparsers.add_parser("create", help="Create a new admin account")
    create_parser.add_argument("--email", required=True, help="Admin email address")
    create_parser.add_argument("--name", required=True, help="Full name of administrator")
    create_parser.add_argument("--password", required=False, help="Account password (if omitted, prompts securely)")
    create_parser.add_argument("--promote", action="store_true", help="Promote if user already exists as employee")

    # Update
    update_parser = subparsers.add_parser("update", help="Update admin password, name, or status")
    update_parser.add_argument("--email", required=True, help="Admin email address")
    update_parser.add_argument("--name", required=False, help="New full name")
    update_parser.add_argument("--password", required=False, help="New password")
    update_parser.add_argument("--activate", action="store_true", default=None, help="Activate account")
    update_parser.add_argument("--deactivate", action="store_true", default=None, help="Deactivate account")

    # Delete
    delete_parser = subparsers.add_parser("delete", help="Delete an admin account")
    delete_parser.add_argument("--email", required=True, help="Admin email to delete")
    delete_parser.add_argument("-f", "--force", action="store_true", help="Force deletion without confirmation prompt")

    args = parser.parse_args()

    if not args.command:
        interactive_menu()
        return

    if args.command == "list":
        list_admins()
    elif args.command == "create":
        pwd = args.password
        if not pwd:
            pwd = getpass.getpass("Enter password (min 8 chars): ")
            confirm = getpass.getpass("Confirm password: ")
            if pwd != confirm:
                print("[ERROR] Passwords do not match.")
                sys.exit(1)
        success = create_admin(email=args.email, full_name=args.name, password=pwd, promote_existing=args.promote)
        sys.exit(0 if success else 1)
    elif args.command == "update":
        act = None
        if args.activate:
            act = True
        elif args.deactivate:
            act = False
        success = update_admin(email=args.email, password=args.password, full_name=args.name, activate=act)
        sys.exit(0 if success else 1)
    elif args.command == "delete":
        success = delete_admin(email=args.email, force=args.force)
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
