import { Component } from '@angular/core';
import { RouterModule, Routes, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { ChildrenOutletContexts } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, RouterOutlet, HeaderComponent, FooterComponent, FormsModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  title = 'DiplomProject';
  constructor(private contexts: ChildrenOutletContexts) {}
  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.data?.['animation'];
  }
  isModalOpen = false;
  formData = {
    name: '',
    phone: '',
    message: ''
  }
  openModal() {
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    this.isModalOpen = false;
    document.body.style.overflow = '';
  }

  submitForm() {
    // Здесь логика отправки формы
    console.log('Форма отправлена:', this.formData);
    
    // Можно добавить обработку:
    // - Отправка на сервер
    // - Показ уведомления
    // - Очистка формы
    
    this.closeModal();
    
    // Пример уведомления:
    alert('Ваша заявка принята! Мы свяжемся с вами в ближайшее время.');
    
    // Очистка формы
    this.formData = {
      name: '',
      phone: '',
      message: ''
    };
  }
}
