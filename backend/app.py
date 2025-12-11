
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when, lit
import shutil
import os

def atomic_replace(src_dir, dst_dir):
    # Remove destination if exists, then move src -> dst
    if os.path.exists(dst_dir):
        shutil.rmtree(dst_dir)
    os.rename(src_dir, dst_dir)

def main():
    spark = SparkSession.builder \
        .appName("BasicSparkCRUD") \
        .master("local[*]") \
        .getOrCreate()

    spark.sparkContext.setLogLevel("WARN")

    table_path = "parquet-table"
    tmp_path = "parquet-table_tmp"

    # --- CREATE ---
    print("\n=== CREATE: write initial dataset ===")
    data = [(1, "Alice", 29), (2, "Bob", 31), (3, "Charlie", 25)]
    df = spark.createDataFrame(data, ["id", "name", "age"])
    df.write.mode("overwrite").parquet(table_path)

    # --- READ ---
    print("\n=== READ: load the table ===")
    df_read = spark.read.parquet(table_path)
    df_read.show()

    # --- UPDATE ---
    print("\n=== UPDATE: change age for Alice to 30 ===")
    df_updated = df_read.withColumn(
        "age", when(col("name") == "Alice", lit(30)).otherwise(col("age"))
    )
    # write to temp, then swap
    df_updated.write.mode("overwrite").parquet(tmp_path)
    atomic_replace(tmp_path, table_path)

    # Clear Spark’s metadata caches to be extra safe
    spark.catalog.clearCache()
    spark.conf.set("spark.sql.parquet.cacheMetadata", "false")

    # --- DELETE ---
    print("\n=== DELETE: remove Bob ===")
    df_after_update = spark.read.parquet(table_path)
    df_after_delete = df_after_update.filter(col("name") != "Bob")
    df_after_delete.write.mode("overwrite").parquet(tmp_path)
    atomic_replace(tmp_path, table_path)

    # --- APPEND ---
    print("\n=== APPEND: add David ===")
    df_new = spark.createDataFrame([(4, "David", 40)], ["id", "name", "age"])
    df_new.write.mode("append").parquet(table_path)

    # --- READ AGAIN ---
    print("\n=== READ AGAIN: verify changes ===")
    final_df = spark.read.parquet(table_path)
    final_df.orderBy("id").show()

    print("\n=== SUMMARY ===")
    print(f"Row count: {final_df.count()}")
    final_df.groupBy().agg({"age": "avg"}).show()

    spark.stop()

if __name__ == "__main__":
    main()
