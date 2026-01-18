from database import engine, Base
import models

def upgrade():
    print("Creating all missing tables based on models...")
    Base.metadata.create_all(bind=engine)
    print("Done.")

if __name__ == "__main__":
    upgrade()
