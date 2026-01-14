from sqlalchemy.orm import Session
from datetime import datetime
from models import Account, MonthlyObligation, AccountType
from analysis_schema import AllocationResponse, Recommendation

def calculate_allocation(db: Session) -> AllocationResponse:
    # 1. Get Liquid Cash (Checking + Savings)
    accounts = db.query(Account).filter(
        Account.account_type.in_([AccountType.CHECKING, AccountType.SAVINGS])
    ).all()
    
    liquid_cash = sum(acc.current_balance for acc in accounts)
    
    # 2. Get Today's Date
    today = datetime.now()
    current_day = today.day
    
    # 3. Calculate Unpaid Obligations (Rest of Month)
    # logic: if due_day > current_day, we assume it's still due this month
    obligations = db.query(MonthlyObligation).all()
    
    unpaid_amount = 0.0
    upcoming_bills = []
    
    for obl in obligations:
        if obl.due_day > current_day:
            unpaid_amount += obl.amount
            upcoming_bills.append(obl)
            
    # 4. Calculate Freedom Cash
    freedom_cash = liquid_cash - unpaid_amount
    
    recommendations = []
    message = ""
    
    # 5. Generate Recommendations
    if upcoming_bills:
        bill_names = ", ".join([b.name for b in upcoming_bills])
        recommendations.append(Recommendation(
            type="bill",
            text=f"Reserve ${unpaid_amount:.2f} for upcoming bills: {bill_names}"
        ))
    else:
        recommendations.append(Recommendation(
            type="info",
            text="No more billing cycles detected this month."
        ))

    if freedom_cash < 0:
        shortfall = abs(freedom_cash)
        message = f"Warning: You are short ${shortfall:.2f} for this month."
        recommendations.append(Recommendation(
            type="warning",
            text=f"You need ${shortfall:.2f} more to cover upcoming bills."
        ))
    else:
        message = "You are in a safe financial position."
        if freedom_cash > 0:
            recommendations.append(Recommendation(
                type="save",
                text=f"You have ${freedom_cash:.2f} available. Consider moving some to Savings."
            ))
            
    return AllocationResponse(
        liquid_cash=liquid_cash,
        unpaid_obligations_this_month=unpaid_amount,
        freedom_cash=freedom_cash,
        message=message,
        recommendations=recommendations
    )
