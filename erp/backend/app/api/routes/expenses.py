from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, desc, func
from sqlalchemy.orm import Session

from app.models.user import User
from app.core.database import get_db
from app.models.expense import Expense
from app.models.finance_account import FinanceAccount
from app.models.finance_journal_entry import FinanceJournalEntry
from app.models.finance_journal_line import FinanceJournalLine
from app.models.employee import Employee
from app.schemas.expense import (
    Expense as ExpenseSchema,
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseSummary,
)
from app.api.dependencies import require_permission

router = APIRouter(dependencies=[Depends(require_permission("accounts:full"))])

def _next_expense_entry_no(db: Session, expense_date: date) -> str:
    """Generate next journal entry number for expense"""
    ym = expense_date.strftime("%Y%m")
    prefix = f"EXP-{ym}-"

    last = (
        db.query(FinanceJournalEntry)
        .filter(FinanceJournalEntry.entry_no.like(f"{prefix}%"))
        .order_by(FinanceJournalEntry.id.desc())
        .first()
    )

    if not last:
        return f"{prefix}0001"

    tail = last.entry_no.replace(prefix, "")
    try:
        n = int(tail)
    except ValueError:
        n = 0
    return f"{prefix}{n + 1:04d}"


def _create_expense_journal_entry(db: Session, expense: Expense) -> FinanceJournalEntry:
    """Create journal entry for expense"""
    if not expense.account_id:
        # Find or create default expense account
        expense_account = db.query(FinanceAccount).filter(
            FinanceAccount.account_type == "EXPENSE",
            FinanceAccount.name.ilike("%general%expense%")
        ).first()
        
        if not expense_account:
            # Create default expense account
            expense_account = FinanceAccount(
                code="EXP-001",
                name="General Expenses",
                account_type="EXPENSE",
                is_system=True,
                is_active=True
            )
            db.add(expense_account)
            db.flush()
        
        expense.account_id = expense_account.id

    # Find cash/bank account for credit side
    cash_account = db.query(FinanceAccount).filter(
        FinanceAccount.account_type == "ASSET",
        FinanceAccount.name.ilike("%cash%")
    ).first()
    
    if not cash_account:
        # Create default cash account
        cash_account = FinanceAccount(
            code="CASH-001",
            name="Cash Account",
            account_type="ASSET",
            is_system=True,
            is_active=True
        )
        db.add(cash_account)
        db.flush()

    # Create journal entry
    entry_no = _next_expense_entry_no(db, expense.expense_date)
    journal_entry = FinanceJournalEntry(
        entry_no=entry_no,
        entry_date=expense.expense_date,
        memo=f"Expense: {expense.description}",
        source_type="EXPENSE",
        source_id=str(expense.id),
        status="DRAFT"
    )

    # Debit expense account
    journal_entry.lines.append(
        FinanceJournalLine(
            account_id=expense.account_id,
            description=expense.description,
            debit=expense.amount,
            credit=Decimal("0"),
            employee_id=expense.employee_id
        )
    )

    # Credit cash account
    journal_entry.lines.append(
        FinanceJournalLine(
            account_id=cash_account.id,
            description=f"Payment for: {expense.description}",
            debit=Decimal("0"),
            credit=expense.amount,
            employee_id=expense.employee_id
        )
    )

    db.add(journal_entry)
    db.flush()
    
    return journal_entry


@router.get("/", response_model=List[ExpenseSchema])
def list_expenses(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    query = db.query(Expense).filter(Expense.is_active == True)
    
    if category:
        query = query.filter(Expense.category.ilike(f"%{category}%"))
    
    if status:
        query = query.filter(Expense.status == status.upper())
    
    if from_date:
        query = query.filter(Expense.expense_date >= from_date)
    
    if to_date:
        query = query.filter(Expense.expense_date <= to_date)
    
    return query.order_by(desc(Expense.expense_date)).offset(skip).limit(limit).all()


@router.post("/", response_model=ExpenseSchema)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = Expense(
        expense_date=payload.expense_date,
        category=payload.category,
        description=payload.description,
        amount=payload.amount,
        vendor_name=payload.vendor_name,
        receipt_number=payload.receipt_number,
        notes=payload.notes,
        attachment_url=payload.attachment_url,
        employee_id=payload.employee_id,
        status="PENDING"
    )

    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.get("/{expense_id}", response_model=ExpenseSchema)
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.put("/{expense_id}", response_model=ExpenseSchema)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Update fields
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(expense, field, value)

    if payload.status and payload.status.upper() == "APPROVED" and expense.status != "APPROVED":
        expense.approved_at = func.now()

    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    expense.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/{expense_id}/approve", response_model=ExpenseSchema)
def approve_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if expense.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending expenses can be approved")

    expense.status = "APPROVED"
    expense.approved_at = func.now()
    
    db.commit()
    db.refresh(expense)
    return expense


@router.post("/{expense_id}/pay", response_model=ExpenseSchema)
def pay_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if expense.status not in ["APPROVED", "PENDING"]:
        raise HTTPException(status_code=400, detail="Only approved or pending expenses can be paid")

    if expense.status == "PAID":
        return expense  # Already paid

    try:
        expense.status = "PAID"
        expense.paid_at = func.now()
        
        db.commit()
        db.refresh(expense)
        return expense
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process payment: {str(e)}")


@router.post("/{expense_id}/undo-payment", response_model=ExpenseSchema)
def undo_payment(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if expense.status != "PAID":
        raise HTTPException(status_code=400, detail="Only paid expenses can be undone")

    try:
        expense.status = "APPROVED"
        expense.paid_at = None
        expense.journal_entry_id = None
        
        db.commit()
        db.refresh(expense)
        return expense
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to undo payment: {str(e)}")


@router.get("/summary/monthly", response_model=ExpenseSummary)
def get_expense_summary(
    month: Optional[str] = Query(None, description="YYYY-MM format"),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    query = db.query(Expense).filter(Expense.is_active == True)
    
    if month:
        try:
            year, month_num = month.split("-")
            query = query.filter(
                func.extract("year", Expense.expense_date) == int(year),
                func.extract("month", Expense.expense_date) == int(month_num)
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")

    expenses = query.all()
    
    total_expenses = sum(e.amount for e in expenses)
    pending_expenses = sum(e.amount for e in expenses if e.status == "PENDING")
    approved_expenses = sum(e.amount for e in expenses if e.status == "APPROVED")
    paid_expenses = sum(e.amount for e in expenses if e.status == "PAID")
    
    # Group by category
    categories = {}
    for expense in expenses:
        if expense.category not in categories:
            categories[expense.category] = Decimal("0")
        categories[expense.category] += expense.amount

    return ExpenseSummary(
        total_expenses=total_expenses,
        pending_expenses=pending_expenses,
        approved_expenses=approved_expenses,
        paid_expenses=paid_expenses,
        expense_count=len(expenses),
        categories=categories
    )


@router.get("/{expense_id}/export/pdf")
def export_expense_pdf(
    expense_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    import os
    
    expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.is_active == True
    ).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1677ff'),
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.grey,
            alignment=TA_CENTER,
            spaceAfter=20
        )
        
        # Try to add logo
        logo_paths = [
            os.path.join(os.path.dirname(__file__), '../../../Logo-removebg-preview.png'),
            os.path.join(os.path.dirname(__file__), '../../../frontend-next/public/logo-removebg-preview.png'),
            'C:/Users/ahmed/Desktop/kiro/erp/Logo-removebg-preview.png'
        ]
        
        for logo_path in logo_paths:
            if os.path.exists(logo_path):
                try:
                    logo = Image(logo_path, width=1.5*inch, height=1.5*inch)
                    logo.hAlign = 'CENTER'
                    elements.append(logo)
                    elements.append(Spacer(1, 10))
                    break
                except:
                    continue
        
        # Title
        title = Paragraph(f"<b>FLASH ERP</b>", title_style)
        elements.append(title)
        
        subtitle = Paragraph(f"Expense Report - #{expense.id}", subtitle_style)
        elements.append(subtitle)
        
        # Export date
        export_date = Paragraph(
            f"<i>Generated on: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</i>",
            subtitle_style
        )
        elements.append(export_date)
        elements.append(Spacer(1, 20))
        
        # Expense details with enhanced styling
        data = [
            ['Field', 'Value'],
            ['Date', str(expense.expense_date)],
            ['Category', expense.category],
            ['Description', expense.description],
            ['Amount', f"Rs {expense.amount:,.2f}"],
            ['Vendor', expense.vendor_name or '-'],
            ['Receipt Number', expense.receipt_number or '-'],
            ['Status', expense.status],
            ['Notes', expense.notes or '-'],
        ]
        
        table = Table(data, colWidths=[150, 350])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1677ff')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f0f9ff')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#91d5ff')),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        
        elements.append(table)
        
        # Footer
        elements.append(Spacer(1, 30))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
        footer = Paragraph("This is a computer-generated document. No signature is required.", footer_style)
        elements.append(footer)
        
        doc.build(elements)
        
        buffer.seek(0)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=expense_{expense_id}.pdf"}
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF generation not available. Install reportlab: pip install reportlab")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


@router.get("/export/pdf")
def export_expenses_pdf(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(require_permission("accounts:full")),
):
    from fastapi.responses import StreamingResponse
    from io import BytesIO
    import os
    
    query = db.query(Expense).filter(Expense.is_active == True)
    
    if from_date:
        query = query.filter(Expense.expense_date >= from_date)
    if to_date:
        query = query.filter(Expense.expense_date <= to_date)
    
    expenses = query.order_by(Expense.expense_date.desc()).all()
    
    if not expenses:
        raise HTTPException(status_code=404, detail="No expenses found for the selected date range")
    
    try:
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(letter), topMargin=0.5*inch, bottomMargin=0.5*inch)
        elements = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=28,
            textColor=colors.HexColor('#1677ff'),
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.grey,
            alignment=TA_CENTER,
            spaceAfter=12
        )
        
        # Try to add logo
        logo_paths = [
            os.path.join(os.path.dirname(__file__), '../../../Logo-removebg-preview.png'),
            os.path.join(os.path.dirname(__file__), '../../../frontend-next/public/logo-removebg-preview.png'),
            'C:/Users/ahmed/Desktop/kiro/erp/Logo-removebg-preview.png'
        ]
        
        for logo_path in logo_paths:
            if os.path.exists(logo_path):
                try:
                    logo = Image(logo_path, width=1.5*inch, height=1.5*inch)
                    logo.hAlign = 'CENTER'
                    elements.append(logo)
                    elements.append(Spacer(1, 10))
                    break
                except:
                    continue
        
        # Title
        title = Paragraph(f"<b>FLASH ERP</b>", title_style)
        elements.append(title)
        
        subtitle = Paragraph(f"Expenses Report", subtitle_style)
        elements.append(subtitle)
        
        # Date range
        if from_date and to_date:
            date_range = Paragraph(f"<b>Period:</b> {from_date.strftime('%B %d, %Y')} to {to_date.strftime('%B %d, %Y')}", subtitle_style)
            elements.append(date_range)
        
        # Export date
        export_date = Paragraph(
            f"<i>Generated on: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</i>",
            subtitle_style
        )
        elements.append(export_date)
        elements.append(Spacer(1, 20))
        
        # Summary statistics
        total = sum(e.amount for e in expenses)
        pending = sum(e.amount for e in expenses if e.status == "PENDING")
        approved = sum(e.amount for e in expenses if e.status == "APPROVED")
        paid = sum(e.amount for e in expenses if e.status == "PAID")
        
        summary_data = [
            ['Total Expenses', 'Pending', 'Approved', 'Paid', 'Count'],
            [f"Rs {total:,.2f}", f"Rs {pending:,.2f}", f"Rs {approved:,.2f}", f"Rs {paid:,.2f}", str(len(expenses))]
        ]
        
        summary_table = Table(summary_data, colWidths=[140, 140, 140, 140, 80])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1677ff')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#e6f7ff')),
            ('GRID', (0, 0), (-1, -1), 1.5, colors.HexColor('#91d5ff')),
            ('FONTSIZE', (0, 1), (-1, -1), 12),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica-Bold'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        
        elements.append(summary_table)
        elements.append(Spacer(1, 25))
        
        # Table data
        data = [['ID', 'Date', 'Category', 'Description', 'Amount', 'Vendor', 'Status']]
        
        for exp in expenses:
            data.append([
                str(exp.id),
                exp.expense_date.strftime('%Y-%m-%d'),
                exp.category,
                exp.description[:35] + '...' if len(exp.description) > 35 else exp.description,
                f"Rs {exp.amount:,.2f}",
                (exp.vendor_name[:18] + '...' if exp.vendor_name and len(exp.vendor_name) > 18 else exp.vendor_name) if exp.vendor_name else '-',
                exp.status
            ])
        
        table = Table(data, colWidths=[35, 75, 85, 180, 85, 100, 80])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1677ff')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (4, 0), (4, -1), 'RIGHT'),  # Amount column right-aligned
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f0f9ff')),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#91d5ff')),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f0f9ff'), colors.white]),
        ]))
        
        elements.append(table)
        
        # Total summary at bottom
        elements.append(Spacer(1, 25))
        
        total_style = ParagraphStyle(
            'TotalStyle',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#1677ff'),
            alignment=TA_RIGHT,
            fontName='Helvetica-Bold'
        )
        
        summary_text = Paragraph(f"<b>Grand Total: Rs {total:,.2f}</b>", total_style)
        elements.append(summary_text)
        
        # Footer
        elements.append(Spacer(1, 20))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER
        )
        footer = Paragraph("This is a computer-generated document. No signature is required.", footer_style)
        elements.append(footer)
        
        doc.build(elements)
        
        buffer.seek(0)
        filename = f"expenses_{from_date or 'all'}_{to_date or 'all'}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF generation not available. Install reportlab: pip install reportlab")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")