module com.thaudal.hammi {
    requires javafx.controls;
    requires javafx.fxml;

    requires org.controlsfx.controls;
    requires com.almasb.fxgl.all;

    opens com.thaudal.hammi to javafx.fxml;
    exports com.thaudal.hammi;
}