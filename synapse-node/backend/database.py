"""SQLAlchemy models for the spec schema (same `synapse_*` tables as the Next.js deployment)."""
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, CheckConstraint, Column, DateTime, ForeignKey, Integer, Numeric, String, Text,
    UniqueConstraint, create_engine, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://synapse:synapse@localhost:5432/synapse_node")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


class MasterPrompt(Base):
    __tablename__ = "synapse_master_prompts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prompt_text = Column(Text, nullable=False)
    instruction = Column(Text, nullable=False, default="")
    status = Column(String(50), nullable=False, default="ACTIVE")
    created_by = Column(Text, nullable=False, default="operator")
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (CheckConstraint("status IN ('ACTIVE','PAUSED','COMPLETED')"),)


class OutputBatch(Base):
    __tablename__ = "synapse_output_batches"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    seq = Column(BigInteger, unique=True, server_default=func.nextval("synapse_output_batches_seq_seq"))
    master_prompt_id = Column(UUID(as_uuid=True), ForeignKey("synapse_master_prompts.id", ondelete="CASCADE"), nullable=False)
    batch_number = Column(Integer, nullable=False)
    status = Column(String(16), nullable=False)
    target_codename = Column(String(100))
    raw_output = Column(JSONB)
    anomaly_score = Column(Numeric(5, 2))
    error = Column(Text)
    model = Column(Text)
    processed_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    __table_args__ = (UniqueConstraint("master_prompt_id", "batch_number"), CheckConstraint("status IN ('OK','ERROR')"))


class SystemTelemetry(Base):
    __tablename__ = "synapse_system_telemetry"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("synapse_output_batches.id", ondelete="CASCADE"))
    metric_key = Column(String(50), nullable=False)
    metric_value = Column(String(255), nullable=False)
    logged_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


SCHEMA_SQL = open(os.path.join(os.path.dirname(__file__), "schema.sql")).read()


def init_db() -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql(SCHEMA_SQL)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
