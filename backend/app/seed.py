from app.database import SessionLocal, engine, Base
from app.models import User, Customer
from app.auth import get_password_hash

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed Admin User
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        if not admin:
            print("Creating Admin user (admin@example.com / admin123)...")
            admin = User(
                email="admin@example.com",
                full_name="System Administrator",
                hashed_password=get_password_hash("admin123"),
                is_active=True
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)

        # Check existing customers
        existing_count = db.query(Customer).count()
        if existing_count == 0:
            print("Seeding sample customer records...")
            sample_customers = [
                {
                    "name": "Sarah Connor",
                    "email": "sarah.connor@cyberdyne.com",
                    "phone": "+1 (555) 019-2834",
                    "company": "Cyberdyne Systems",
                    "address": "100 Tech Boulevard, San Jose, CA 95110",
                    "status": "Active",
                    "notes": "Key contact for AI security infrastructure project.",
                    "owner_id": admin.id
                },
                {
                    "name": "Alex Mercer",
                    "email": "alex.m@gentek.org",
                    "phone": "+1 (555) 438-9102",
                    "company": "Gentek Innovations",
                    "address": "450 Science Park Way, Boston, MA 02115",
                    "status": "Lead",
                    "notes": "Interested in enterprise API integrations.",
                    "owner_id": admin.id
                },
                {
                    "name": "Elena Rostova",
                    "email": "elena@apexlogistics.io",
                    "phone": "+44 20 7946 0912",
                    "company": "Apex Global Logistics",
                    "address": "12 Canary Wharf, London, UK E14 5AB",
                    "status": "Active",
                    "notes": "Annual contract renewal coming up Q4.",
                    "owner_id": admin.id
                },
                {
                    "name": "David Chen",
                    "email": "dchen@nexuscloud.tech",
                    "phone": "+1 (555) 882-3104",
                    "company": "Nexus Cloud Solutions",
                    "address": "888 Silicon Way, Austin, TX 78701",
                    "status": "Prospect",
                    "notes": "Demo scheduled for next Tuesday.",
                    "owner_id": admin.id
                },
                {
                    "name": "Priya Sharma",
                    "email": "priya.sharma@starlight.in",
                    "phone": "+91 98765 43210",
                    "company": "Starlight Digital",
                    "address": "MG Road, Tech Hub, Bengaluru, India 560001",
                    "status": "Active",
                    "notes": "Expanded cloud storage tier last month.",
                    "owner_id": admin.id
                },
                {
                    "name": "Marcus Vance",
                    "email": "marcus@vancecapital.com",
                    "phone": "+1 (555) 319-4820",
                    "company": "Vance Capital Group",
                    "address": "200 Wall Street, New York, NY 10005",
                    "status": "Inactive",
                    "notes": "Requested account pause until next fiscal year.",
                    "owner_id": admin.id
                }
            ]

            for cust_data in sample_customers:
                customer = Customer(**cust_data)
                db.add(customer)
            
            db.commit()
            print("Successfully seeded sample customer records!")
        else:
            print(f"Database already contains {existing_count} customers.")

    except Exception as e:
        print(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
