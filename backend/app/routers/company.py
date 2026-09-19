import datetime
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CompanyDetails
from app.schemas import CompanyDetailsResponse, CompanyDetailsUpdate
from app.auth import get_current_user, require_admin
from app.models import User

router = APIRouter(prefix="/api/company", tags=["Company Details"])


def _get_or_create(db: Session) -> CompanyDetails:
    """Return the single company details record, creating it if absent."""
    record = db.query(CompanyDetails).filter(CompanyDetails.id == 1).first()
    if not record:
        record = CompanyDetails(id=1)
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


@router.get("", response_model=CompanyDetailsResponse)
def get_company_details(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve company profile details.
    Accessible by all authenticated users (admin + employee).
    """
    return _get_or_create(db)


@router.put("", response_model=CompanyDetailsResponse)
def update_company_details(
    payload: CompanyDetailsUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    """
    Update company profile details. Admin only.
    Performs an upsert — creates the record on first save if it doesn't exist.
    """
    record = _get_or_create(db)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(record, field, value)

    record.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(record)
    return record
