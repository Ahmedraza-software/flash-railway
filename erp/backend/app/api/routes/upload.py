import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter()

# Define upload directory (relative to project root)
UPLOAD_DIR = Path(__file__).parent.parent.parent.parent.parent / "uploads" / "expenses"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file and return its URL"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Get file extension
        file_ext = os.path.splitext(file.filename)[1]
        
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        new_filename = f"{timestamp}_{unique_id}{file_ext}"
        
        # Save file
        file_path = UPLOAD_DIR / new_filename
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Return URL path
        file_url = f"/uploads/expenses/{new_filename}"
        
        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "url": file_url,
                "path": file_url,
                "filename": new_filename,
                "original_filename": file.filename
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")
