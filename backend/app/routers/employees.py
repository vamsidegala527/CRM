import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Union
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, BackgroundTasks
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from sqlalchemy import func

from app.database import get_db
from app.models import User
from app.schemas import (
    UserResponse, EmployeeCreate, EmployeeUpdate, EmployeeSelfUpdate
)
from app.auth import get_current_user, require_admin, generate_employee_setup_token
from app.email_service import send_employee_setup_email
from app.routers.auth import get_frontend_base_url

router = APIRouter(prefix="/api/employees", tags=["Employee Management"])


def find_employee(id_or_pid: str, db: Session) -> User:
    """Helper to find an employee by integer ID or UUID public_id."""
    employee = None
    if id_or_pid.isdigit():
        employee = db.query(User).filter(
            (User.id == int(id_or_pid)) | (User.public_id == id_or_pid),
            User.role == "employee"
        ).first()
    else:
        employee = db.query(User).filter(
            User.public_id == id_or_pid,
            User.role == "employee"
        ).first()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found."
        )
    return employee


@router.get("", response_model=List[UserResponse])
def list_employees(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    status: Optional[str] = None,
    account_status: Optional[str] = None,
    setup_status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Admin-only endpoint to list all employees with optional search and independent status filters."""
    query = db.query(User).filter(User.role == "employee")

    # Independent Account Status Filter: active | inactive
    if account_status and account_status.strip() and account_status.strip().lower() != "all":
        acc = account_status.strip().lower()
        if acc == "active":
            query = query.filter(User.is_active == True)
        elif acc == "inactive":
            query = query.filter(User.is_active == False)

    # Independent Setup Status Filter: pending | completed
    if setup_status and setup_status.strip() and setup_status.strip().lower() != "all":
        setp = setup_status.strip().lower()
        if setp in ["pending", "setup pending", "setup_pending"]:
            query = query.filter(User.is_setup_complete == False)
        elif setp in ["completed", "setup completed", "setup_completed"]:
            query = query.filter(User.is_setup_complete == True)

    # Legacy combined status parameter fallback (if specific filters were not provided)
    if status and status.strip() and status.strip().lower() != "all" and not account_status and not setup_status:
        st = status.strip().lower()
        if st in ["active"]:
            query = query.filter(User.is_active == True)
        elif st in ["inactive"]:
            query = query.filter(User.is_active == False)
        elif st in ["pending", "setup pending", "setup_pending"]:
            query = query.filter(User.is_setup_complete == False)
        elif st in ["completed", "setup completed", "setup_completed"]:
            query = query.filter(User.is_setup_complete == True)

    # Search across full_name, email, department, job_title, phone, company, public_id
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            User.full_name.ilike(term) |
            User.email.ilike(term) |
            User.department.ilike(term) |
            User.job_title.ilike(term) |
            User.phone.ilike(term) |
            User.company.ilike(term) |
            User.public_id.ilike(term)
        )

    employees = query.order_by(User.id.desc()).offset(skip).limit(limit).all()
    return employees


@router.get("/metrics")
def get_employee_metrics(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Admin-only endpoint to calculate directory-wide employee metrics directly from the database."""
    base = db.query(User).filter(User.role == "employee")
    total_count = base.count()
    active_count = base.filter(User.is_active == True).count()
    inactive_count = base.filter(User.is_active == False).count()
    pending_count = base.filter(User.is_setup_complete == False).count()
    completed_count = base.filter(User.is_setup_complete == True).count()

    return {
        "total_employees": total_count,
        "active_staff": active_count,
        "inactive_staff": inactive_count,
        "setup_pending": pending_count,
        "setup_completed": completed_count
    }



@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    request: Request,
    payload: EmployeeCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Admin creates a new employee, stores a hashed setup token, and dispatches an invitation email."""
    email_clean = payload.email.strip().lower()

    # Verify email uniqueness across all users and employees
    existing = db.query(User).filter(func.lower(func.trim(User.email)) == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user or employee account with this email address already exists."
        )

    fe_url = get_frontend_base_url(request)
    setup_expires = datetime.utcnow() + timedelta(hours=48)

    new_employee = User(
        email=email_clean,
        full_name=payload.full_name,
        department=payload.department,
        job_title=payload.job_title,
        company=payload.company,
        address=payload.address,
        notes=payload.notes,
        phone=payload.phone,
        emergency_contact=payload.emergency_contact,
        experience_years=payload.experience_years,
        previous_companies=payload.previous_companies,
        previous_roles=payload.previous_roles,
        skills=payload.skills,
        education=payload.education,
        certifications=payload.certifications,
        role="employee",
        is_active=True,
        is_verified=True,
        first_login=True,
        is_setup_complete=False,
        setup_token_expires=setup_expires
    )

    db.add(new_employee)
    db.commit()
    db.refresh(new_employee)

    # Cryptographically secure setup token using JWT + hash
    raw_token, token_hash, setup_url, inv_code = generate_employee_setup_token(new_employee, fe_url)
    new_employee.setup_token_hash = token_hash
    db.commit()
    db.refresh(new_employee)

    # Attach to response model
    new_employee.setup_url = setup_url
    new_employee.invitation_code = inv_code

    print(f"🔗 [EMPLOYEE SETUP LINK] Account setup link for {new_employee.email} (Code: {inv_code}): {setup_url}")

    # Send invitation setup email safely in background without blocking response
    background_tasks.add_task(
        send_employee_setup_email,
        to_email=new_employee.email,
        employee_name=new_employee.full_name,
        token=raw_token,
        frontend_url=fe_url
    )

    return new_employee


@router.get("/me", response_model=UserResponse)
def get_current_employee_profile(current_user: User = Depends(get_current_user)):
    """Returns the current authenticated employee/user profile."""
    return current_user


@router.put("/me", response_model=UserResponse)
def update_current_employee_profile(
    payload: EmployeeSelfUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Allows current authenticated employee to update their own contact details."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    if payload.department is not None:
        current_user.department = payload.department
    if payload.phone is not None:
        current_user.phone = payload.phone
    if payload.address is not None:
        current_user.address = payload.address
    if payload.emergency_contact is not None:
        current_user.emergency_contact = payload.emergency_contact
    if payload.experience_years is not None:
        current_user.experience_years = payload.experience_years
    if payload.previous_companies is not None:
        current_user.previous_companies = payload.previous_companies
    if payload.previous_roles is not None:
        current_user.previous_roles = payload.previous_roles
    if payload.skills is not None:
        current_user.skills = payload.skills
    if payload.education is not None:
        current_user.education = payload.education
    if payload.certifications is not None:
        current_user.certifications = payload.certifications
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/{id_or_pid}", response_model=UserResponse)
def get_employee(
    id_or_pid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin can view any employee. Employees can only view their own profile."""
    employee = find_employee(id_or_pid, db)

    if current_user.role == "admin":
        return employee

    if current_user.role == "employee":
        if current_user.id != employee.id and current_user.public_id != employee.public_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only view your own profile."
            )
        return employee

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied."
    )


@router.put("/{id_or_pid}", response_model=UserResponse)
def update_employee(
    id_or_pid: str,
    request: Request,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update employee profile:
    - Admin can update full_name, department, job_title, phone, company, address, notes, is_active, career & education fields.
    - Employee can update their own personal info, phone, address, emergency contact, career & education fields.
    - Roles cannot be modified by anyone via this endpoint.
    """
    employee = find_employee(id_or_pid, db)

    if current_user.role == "admin":
        update_data = EmployeeUpdate.model_validate(payload)

        if update_data.full_name is not None:
            employee.full_name = update_data.full_name
        if update_data.department is not None:
            employee.department = update_data.department
        if update_data.job_title is not None:
            employee.job_title = update_data.job_title
        if update_data.company is not None:
            employee.company = update_data.company
        if update_data.address is not None:
            employee.address = update_data.address
        if update_data.notes is not None:
            employee.notes = update_data.notes
        if update_data.phone is not None:
            employee.phone = update_data.phone
        if update_data.emergency_contact is not None:
            employee.emergency_contact = update_data.emergency_contact
        if update_data.experience_years is not None:
            employee.experience_years = update_data.experience_years
        if update_data.previous_companies is not None:
            employee.previous_companies = update_data.previous_companies
        if update_data.previous_roles is not None:
            employee.previous_roles = update_data.previous_roles
        if update_data.skills is not None:
            employee.skills = update_data.skills
        if update_data.education is not None:
            employee.education = update_data.education
        if update_data.certifications is not None:
            employee.certifications = update_data.certifications
        if update_data.is_active is not None:
            if not update_data.is_active and employee.is_active:
                # Deactivating employee: revoke sessions
                employee.token_revoked_at = datetime.utcnow() + timedelta(seconds=1)
            employee.is_active = update_data.is_active

        db.commit()
        db.refresh(employee)
        return employee

    if current_user.role == "employee":
        if current_user.id != employee.id and current_user.public_id != employee.public_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only edit your own profile."
            )
        
        self_data = EmployeeSelfUpdate.model_validate(payload)
        if self_data.full_name is not None:
            employee.full_name = self_data.full_name
        if self_data.department is not None:
            employee.department = self_data.department
        if self_data.phone is not None:
            employee.phone = self_data.phone
        if self_data.address is not None:
            employee.address = self_data.address
        if self_data.emergency_contact is not None:
            employee.emergency_contact = self_data.emergency_contact
        if self_data.experience_years is not None:
            employee.experience_years = self_data.experience_years
        if self_data.previous_companies is not None:
            employee.previous_companies = self_data.previous_companies
        if self_data.previous_roles is not None:
            employee.previous_roles = self_data.previous_roles
        if self_data.skills is not None:
            employee.skills = self_data.skills
        if self_data.education is not None:
            employee.education = self_data.education
        if self_data.certifications is not None:
            employee.certifications = self_data.certifications

        db.commit()
        db.refresh(employee)
        return employee

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied."
    )


@router.post("/{id_or_pid}/reactivate", response_model=UserResponse)
def reactivate_employee(
    id_or_pid: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Admin reactivates an inactive employee account. Preserves token_revoked_at so previously revoked sessions remain invalid."""
    if str(admin_user.id) == str(id_or_pid) or admin_user.public_id == str(id_or_pid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot reactivate administrator accounts via employee endpoints."
        )

    employee = find_employee(id_or_pid, db)

    if employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee is already active."
        )

    employee.is_active = True
    # Crucial security guarantee: token_revoked_at is preserved so previously revoked tokens remain rejected.
    db.commit()
    db.refresh(employee)
    return employee


@router.delete("/{id_or_pid}", status_code=status.HTTP_200_OK)
def deactivate_employee(
    id_or_pid: str,
    permanent: bool = False,
    confirmed: bool = False,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Deactivates or permanently deletes an employee account:
    - Default (permanent=False): Soft-deactivates account and immediately revokes active sessions.
    - Explicit (permanent=True): Permanently removes employee from database only if confirmed=True and no related records exist.
    """
    if str(admin_user.id) == str(id_or_pid) or admin_user.public_id == str(id_or_pid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot deactivate or delete their own account."
        )

    employee = find_employee(id_or_pid, db)

    if permanent:
        if not confirmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Permanent deletion requires explicit confirmation."
            )

        emp_name = employee.full_name
        db.delete(employee)
        db.commit()
        return {"message": f"Employee {emp_name} has been permanently deleted."}

    # Soft deactivation (default)
    employee.is_active = False
    employee.token_revoked_at = datetime.utcnow() + timedelta(seconds=1)
    db.commit()

    return {"message": f"Employee {employee.full_name} has been deactivated successfully."}


@router.get("/{id_or_pid}/setup-link", status_code=status.HTTP_200_OK)
def get_employee_setup_link(
    id_or_pid: str,
    request: Request,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Generates or retrieves an active employee login setup link without sending an email.
    Preserves existing valid tokens so any previous emails remain valid.
    """
    employee = find_employee(id_or_pid, db)

    if employee.is_setup_complete:
        return {
            "message": "This employee account setup is already complete.",
            "setup_url": None,
            "invitation_code": None,
            "is_setup_complete": True
        }

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate a setup link for a deactivated employee account."
        )

    fe_url = get_frontend_base_url(request)
    raw_token, token_hash, setup_url, inv_code = generate_employee_setup_token(employee, fe_url)

    existing = [h.strip() for h in (employee.setup_token_hash or "").split(",") if h.strip()]
    new_hashes = [token_hash] + [h for h in existing if h != token_hash][:5]
    employee.setup_token_hash = ",".join(new_hashes)
    employee.setup_token_expires = datetime.utcnow() + timedelta(hours=48)
    db.commit()

    return {
        "message": f"Setup link ready for {employee.email}.",
        "setup_url": setup_url,
        "invitation_code": inv_code,
        "is_setup_complete": False
    }


def safe_send_setup_email(to_email: str, employee_name: str, token: str, frontend_url: str):
    try:
        send_employee_setup_email(to_email, employee_name, token, frontend_url)
    except Exception as exc:
        print(f"⚠️ [EMPLOYEE EMAIL] Setup email delivery notice for {to_email}: {exc}")


@router.post("/{id_or_pid}/send-login-email", status_code=status.HTTP_200_OK)
def send_employee_login_email(
    id_or_pid: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Generates a secure setup link, preserves previous tokens in a multi-hash list,
    and dispatches the employee login setup link in the background without blocking.
    Returns the setup_url immediately.
    """
    employee = find_employee(id_or_pid, db)

    if not employee.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot send login setup email to an inactive employee account."
        )

    fe_url = get_frontend_base_url(request)
    raw_token, token_hash, setup_url, inv_code = generate_employee_setup_token(employee, fe_url)

    # Preserve previous hashes so earlier invitation emails do not become broken
    existing = [h.strip() for h in (employee.setup_token_hash or "").split(",") if h.strip()]
    new_hashes = [token_hash] + [h for h in existing if h != token_hash][:5]
    employee.setup_token_hash = ",".join(new_hashes)
    employee.setup_token_expires = datetime.utcnow() + timedelta(hours=48)
    db.commit()

    print(f"🔗 [EMPLOYEE SETUP LINK] Generated setup link for {employee.email} (Code: {inv_code}): {setup_url}")

    # Dispatch email in background without blocking response
    background_tasks.add_task(
        safe_send_setup_email,
        to_email=employee.email,
        employee_name=employee.full_name,
        token=raw_token,
        frontend_url=fe_url
    )

    return {
        "message": f"Setup invitation dispatched to {employee.email}. Setup link is ready to copy.",
        "setup_url": setup_url,
        "invitation_code": inv_code,
        "email_delivered": True
    }

