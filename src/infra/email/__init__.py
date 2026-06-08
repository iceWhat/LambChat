"""Email service module."""

from src.infra.email.service import EmailService, close_email_service, get_email_service

__all__ = ["EmailService", "close_email_service", "get_email_service"]
