import aiomysql
import os

async def get_mysql_pool():
    return await aiomysql.create_pool(
        host=os.getenv("DB_HOST", "project-db-cgi.smhrd.com"),
        user=os.getenv("DB_USER", "cgi_25IS_LI1_p3_3"),
        password=os.getenv("DB_PASS", "smhrd3"),
        db=os.getenv("DB_NAME", "cgi_25IS_LI1_p3_3"),
        port=int(os.getenv("DB_PORT", 3307)),
        autocommit=True
    )